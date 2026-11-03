import React, { useRef, useState } from 'react';
import {
  Box,
  Stack,
  Inline,
  Text,
  Strong,
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
import { isConflict } from '../lib/matcher';

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

const times = (n = 0, label) => `${label} ${n === 1 ? 'once' : `${n} times`}`;

// How the decision has fared: flagged, followed, challenged.
export const recordLine = (d) =>
  [
    times(d.caughtCount, 'Flagged new work'),
    times(d.followedCount, 'Followed'),
    `${d.reopenCount || 0} reopen request${d.reopenCount === 1 ? '' : 's'}`,
  ].join(' · ');

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

const verdictStyle = (backgroundColor) =>
  xcss({ backgroundColor, borderRadius: 'border.radius.100', padding: 'space.100' });

const VERDICT = {
  conflicts: { label: 'Conflicts', appearance: 'warning', style: verdictStyle('color.background.warning') },
  unclear: { label: 'Unclear', appearance: 'information', style: verdictStyle('color.background.neutral') },
  fits: { label: 'Fits', appearance: 'success', style: verdictStyle('color.background.success') },
};

const MatchLozenge = ({ match }) => {
  const v = VERDICT[match.verdict];
  if (v) return <Lozenge appearance={v.appearance}>{v.label}</Lozenge>;
  return match.strength === 'strong' ? (
    <Lozenge appearance="warning">Likely conflict</Lozenge>
  ) : (
    <Lozenge>Related</Lozenge>
  );
};

// One decision, the same everywhere it appears. `match` adds how this work relates to it:
// an AI verdict with a reason when there is one, otherwise the words that matched.
export const DecisionCard = ({ decision: d, match, children }) => {
  const terms = match && !match.reason ? (match.matchedKeywords.length ? match.matchedKeywords : match.matchedWords) : [];
  return (
    <Box xcss={match && isConflict(match) ? flaggedCardStyle : cardStyle}>
      <Stack space="space.150">
        <Inline spread="space-between" alignBlock="center">
          <Inline space="space.100" alignBlock="center">
            <Text weight="semibold" color="color.text.subtle">
              {d.ref}
            </Text>
            <StatusLozenge status={d.status} />
          </Inline>
          {match && <MatchLozenge match={match} />}
        </Inline>
        <Heading size="small" as="h3">
          {d.title}
        </Heading>
        {d.rationale && <Text>{d.rationale}</Text>}
        {match?.reason && (
          <Box xcss={(VERDICT[match.verdict] || VERDICT.unclear).style}>
            <Text>
              <Strong>This work: </Strong>
              {match.reason}
            </Text>
          </Box>
        )}
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
  // A second click while the first save is still running must not log the decision twice.
  const inFlight = useRef(false);

  const save = async (values) => {
    if (inFlight.current) return;
    inFlight.current = true;
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
      inFlight.current = false;
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
