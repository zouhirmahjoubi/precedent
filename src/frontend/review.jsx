import React, { useState } from 'react';
import {
  Stack,
  Text,
  Button,
  ButtonGroup,
  LoadingButton,
  SectionMessage,
  Spinner,
  TextArea,
  DatePicker,
  Label,
  Form,
  useForm,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { DecisionCard, DecisionForm, formatDate, recordLine } from './components';

const OUTCOME = {
  keep: (o) => ({ title: 'Kept after review', text: `Precedent asks again on ${formatDate(o.nextReviewBy)}.` }),
  replace: (o) => ({ title: `Replaced by ${o.replacedBy}`, text: 'The old decision no longer flags new work.' }),
  expire: () => ({ title: 'Expired after review', text: 'It no longer flags new work.' }),
};

const CHOICE = {
  keep: {
    title: (ref) => `Keep ${ref}`,
    body: 'It keeps flagging work that goes against it, and comes up for review again on the date you pick.',
    button: 'Keep decision',
    appearance: 'primary',
  },
  expire: {
    title: (ref) => `Let ${ref} expire`,
    body: 'It stops flagging new work. An admin or the owner can make it active again from the decision log.',
    button: 'Let it expire',
    appearance: 'warning',
  },
};

const OutcomeModal = ({ action, decision, suggestedNext, isSending, onClose, onSend }) => {
  const c = CHOICE[action];
  const { register, handleSubmit, getFieldId } = useForm({ defaultValues: { nextReviewBy: suggestedNext, note: '' } });
  return (
    <Modal onClose={onClose}>
      <Form onSubmit={handleSubmit((values) => onSend({ action, ...values }))}>
        <ModalHeader>
          <ModalTitle>{c.title(decision.ref)}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Stack space="space.150">
            <Text>{c.body}</Text>
            {action === 'keep' && (
              <Stack space="space.050">
                <Label labelFor={getFieldId('nextReviewBy')}>Next review</Label>
                <DatePicker {...register('nextReviewBy', { required: true })} />
              </Stack>
            )}
            <Stack space="space.050">
              <Label labelFor={getFieldId('note')}>Note</Label>
              <TextArea {...register('note')} minimumRows={2} placeholder="Optional. Shown in the decision's history." />
            </Stack>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton type="submit" appearance={c.appearance} isLoading={isSending}>
            {c.button}
          </LoadingButton>
        </ModalFooter>
      </Form>
    </Modal>
  );
};

// Shown on a work item Precedent opened to review a decision.
export const ReviewPanel = ({ review, accountId, onDone }) => {
  const d = review.decision;
  const [choice, setChoice] = useState(null);
  const [source, setSource] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  if (!d) return <SectionMessage appearance="error">The decision under review no longer exists.</SectionMessage>;

  const send = async (payload) => {
    setSending(true);
    setError('');
    try {
      await invoke('review', payload);
      setChoice(null);
      onDone();
    } catch (e) {
      setError(e.message || 'Could not save the review.');
    }
    setSending(false);
  };

  const openReplace = async () => {
    setChoice('replace');
    if (!source) setSource(await invoke('getSourceContext'));
  };

  if (review.outcome) {
    const o = OUTCOME[review.outcome.action](review.outcome);
    return (
      <Stack space="space.200">
        <SectionMessage appearance="success" title={o.title}>
          <Text>{o.text}</Text>
          {review.from && <Text>The answer was posted on {review.from} too.</Text>}
          {review.outcome.closed === false && (
            <Text>This workflow has no direct step to Done, so close this work item when you are ready.</Text>
          )}
        </SectionMessage>
        <DecisionCard decision={d} />
      </Stack>
    );
  }

  const canReview = d.ownerAccountId === accountId || d.createdBy === accountId;
  return (
    <Stack space="space.200">
      <SectionMessage
        appearance="information"
        title={review.kind === 'reopen' ? `${d.ref} was challenged on ${review.from}` : `${d.ref} is due for review`}
      >
        {review.kind === 'reopen' && review.note && <Text>What changed: {review.note}</Text>}
        <Text>
          {canReview
            ? 'Keep it, replace it with a new decision, or let it expire.'
            : 'Only the owner can record the outcome of this review.'}
        </Text>
      </SectionMessage>
      <DecisionCard decision={d}>
        <Text size="small" color="color.text.subtle">
          {recordLine(d)}
        </Text>
        {canReview && (
          <ButtonGroup>
            <Button appearance="primary" onClick={() => setChoice('keep')}>
              Keep
            </Button>
            <Button onClick={openReplace}>Replace</Button>
            <Button appearance="subtle" onClick={() => setChoice('expire')}>
              Let it expire
            </Button>
          </ButtonGroup>
        )}
      </DecisionCard>
      {error && <SectionMessage appearance="error">{error}</SectionMessage>}

      <ModalTransition>
        {(choice === 'keep' || choice === 'expire') && (
          <OutcomeModal
            action={choice}
            decision={d}
            suggestedNext={review.suggestedNext}
            isSending={sending}
            onClose={() => setChoice(null)}
            onSend={send}
          />
        )}
        {choice === 'replace' && (
          <Modal onClose={() => setChoice(null)}>
            <ModalHeader>
              <ModalTitle>Replace {d.ref}</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.200">
                <Text>Log the decision that takes its place. {d.ref} stops flagging new work.</Text>
                {source ? (
                  <DecisionForm
                    source={source}
                    initial={{ title: d.title, rationale: d.rationale, keywords: d.keywords, projectKeys: d.projectKeys }}
                    ownerAccountId={accountId}
                    onCancel={() => setChoice(null)}
                    onSaved={(saved) => send({ action: 'replace', replacedBy: saved.ref })}
                  />
                ) : (
                  <Spinner />
                )}
              </Stack>
            </ModalBody>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
};
