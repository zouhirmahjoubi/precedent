import React, { useState } from 'react';
import {
  Box,
  Stack,
  Inline,
  Text,
  Heading,
  Lozenge,
  Link,
  User,
  Tag,
  TagGroup,
  Label,
  Textfield,
  TextArea,
  DatePicker,
  UserPicker,
  HelperMessage,
  ErrorMessage,
  Button,
  LoadingButton,
  RequiredAsterisk,
  Form,
  useForm,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

export const STATUS = {
  active: { label: 'Active', appearance: 'success' },
  replaced: { label: 'Replaced', appearance: 'moved' },
  expired: { label: 'Expired', appearance: 'default' },
};

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const StatusLozenge = ({ status }) => {
  const s = STATUS[status] || STATUS.active;
  return <Lozenge appearance={s.appearance}>{s.label}</Lozenge>;
};

const cardStyle = xcss({
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius.200',
  padding: 'space.200',
  backgroundColor: 'elevation.surface',
});

const flaggedCardStyle = xcss({
  borderColor: 'color.border.warning',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius.200',
  padding: 'space.200',
  backgroundColor: 'elevation.surface',
});

// One decision, the same everywhere it appears. `match` adds why it was flagged.
export const DecisionCard = ({ decision: d, match, children }) => {
  const terms = match ? (match.matchedKeywords.length ? match.matchedKeywords : match.matchedWords) : [];
  return (
    <Box xcss={match?.strength === 'strong' ? flaggedCardStyle : cardStyle}>
      <Stack space="space.150">
        <Inline spread="space-between" alignBlock="center">
          <Inline space="space.100" alignBlock="center">
            <Text weight="semibold" color="color.text.subtle">
              {d.ref}
            </Text>
            <StatusLozenge status={d.status} />
          </Inline>
          {match && (
            <Lozenge appearance={match.strength === 'strong' ? 'warning' : 'default'}>
              {match.strength === 'strong' ? 'Likely conflict' : 'Related'}
            </Lozenge>
          )}
        </Inline>
        <Heading size="small" as="h3">
          {d.title}
        </Heading>
        {d.rationale && <Text>{d.rationale}</Text>}
        <Inline space="space.200" alignBlock="center" shouldWrap>
          {d.ownerAccountId && <User accountId={d.ownerAccountId} />}
          <Text size="small" color="color.text.subtle">
            Decided {formatDate(d.decidedOn)}
          </Text>
          {d.reviewBy && (
            <Text size="small" color="color.text.subtle">
              Review by {formatDate(d.reviewBy)}
            </Text>
          )}
          {d.sourceUrl && (
            <Link href={d.sourceUrl} openNewTab>
              {d.sourceTitle ? `Source: ${d.sourceTitle}` : 'Source'}
            </Link>
          )}
        </Inline>
        {terms.length > 0 && (
          <Text size="small" color="color.text.subtle">
            Matched on: {terms.join(', ')}
          </Text>
        )}
        {!match && d.keywords?.length > 0 && (
          <TagGroup>
            {d.keywords.map((k) => (
              <Tag key={k} text={k} />
            ))}
          </TagGroup>
        )}
        {children}
      </Stack>
    </Box>
  );
};

const Field = ({ id, label, required, helper, error, children }) => (
  <Stack space="space.050">
    <Label labelFor={id}>
      {label}
      {required && <RequiredAsterisk />}
    </Label>
    {children}
    {error ? <ErrorMessage>{error}</ErrorMessage> : helper && <HelperMessage>{helper}</HelperMessage>}
  </Stack>
);

// Create or edit a decision. `source` comes from where it was opened.
// UI Kit text inputs drop keystrokes when React state drives `value`,
// so useForm owns the field values.
export const DecisionForm = ({ initial = {}, source = {}, ownerAccountId, onSaved, onCancel }) => {
  const { register, handleSubmit, getFieldId, formState } = useForm({
    defaultValues: {
      title: initial.title || '',
      rationale: initial.rationale || '',
      keywords: (initial.keywords || []).join(', '),
      projectKeys: (initial.projectKeys || []).join(', '),
      reviewBy: initial.reviewBy || '',
    },
  });
  const [owner, setOwner] = useState(initial.ownerAccountId || ownerAccountId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { errors } = formState;

  const save = async (values) => {
    setSaving(true);
    setError('');
    try {
      const saved = await invoke('saveDecision', {
        ...source,
        ...values,
        ownerAccountId: owner || ownerAccountId,
        ref: initial.ref,
      });
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save the decision.');
      setSaving(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit(save)}>
      <Stack space="space.200">
        {source.sourceTitle && (
          <Text size="small" color="color.text.subtle">
            Logged from {source.sourceKey && source.sourceType === 'jira' ? `${source.sourceKey}: ` : ''}
            {source.sourceTitle}
          </Text>
        )}
        <Field
          id={getFieldId('title')}
          label="What did you decide?"
          required
          error={errors.title && 'Write the decision as a short rule.'}
        >
          <Textfield
            {...register('title', { required: true, validate: (v) => Boolean(v.trim()) })}
            placeholder="No free shipping on orders under $40"
          />
        </Field>
        <Field
          id={getFieldId('rationale')}
          label="Why?"
          required
          error={errors.rationale && 'Add the reason, so people can judge when it no longer holds.'}
        >
          <TextArea
            {...register('rationale', { required: true, validate: (v) => Boolean(v.trim()) })}
            minimumRows={3}
            placeholder="Print costs went up 18%, so orders under $40 lose money with free shipping."
          />
        </Field>
        <Field
          id={getFieldId('keywords')}
          label="Keywords"
          helper="Words people would use in a work item that touches this. Separate with commas."
        >
          <Textfield {...register('keywords')} placeholder="free shipping, shipping threshold" />
        </Field>
        <UserPicker
          label="Owner"
          name="owner"
          defaultValue={owner}
          onChange={(user) => setOwner(user?.id || owner)}
        />
        <Field
          id={getFieldId('reviewBy')}
          label="Review by"
          helper="Precedent lists it as due for review from this date."
        >
          <DatePicker {...register('reviewBy')} placeholder="Optional" />
        </Field>
        <Field
          id={getFieldId('projectKeys')}
          label="Projects"
          helper="Project keys this applies to. Leave empty for all projects."
        >
          <Textfield {...register('projectKeys')} />
        </Field>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <Inline space="space.100" alignInline="end">
          {onCancel && (
            <Button appearance="subtle" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <LoadingButton type="submit" appearance="primary" isLoading={saving}>
            {initial.ref ? 'Save changes' : 'Log decision'}
          </LoadingButton>
        </Inline>
      </Stack>
    </Form>
  );
};
