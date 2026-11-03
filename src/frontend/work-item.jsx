import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Stack,
  Inline,
  Text,
  Heading,
  Button,
  ButtonGroup,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Spinner,
  TextArea,
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
import { invoke, view } from '@forge/bridge';
import { DecisionCard, DecisionForm } from './components';
import { isConflict } from '../lib/matcher';

const RESPONSES = {
  follow: { label: 'Following it', appearance: 'success' },
  reopen: { label: 'Reopen requested', appearance: 'inprogress' },
  unrelated: { label: 'Marked not related', appearance: 'default' },
};

const count = (n) => (n === 1 ? 'an active decision' : `${n} active decisions`);
const ASK = 'Read the decision before you start. Follow it, or ask the owner to reopen it.';

// The banner above the cards. AI verdicts say "goes against"; keyword matches only "touch".
function summarize(matches) {
  const conflicts = matches.filter(isConflict);
  if (conflicts.some((m) => m.verdict)) {
    return { appearance: 'warning', title: `This work goes against ${count(conflicts.length)}`, text: ASK };
  }
  if (matches.every((m) => m.verdict === 'fits')) {
    return {
      appearance: 'success',
      title: 'This work fits your decisions',
      text: 'Precedent checked it against the decisions it touches.',
    };
  }
  return { appearance: conflicts.length ? 'warning' : 'information', title: `This work touches ${count(matches.length)}`, text: ASK };
}

const ReopenModal = ({ decision, isSending, onClose, onSend }) => {
  const { register, handleSubmit, getFieldId } = useForm({ defaultValues: { note: '' } });
  return (
    <Modal onClose={onClose}>
      <Form onSubmit={handleSubmit(({ note }) => onSend(note.trim()))}>
        <ModalHeader>
          <ModalTitle>Ask to reopen {decision.ref}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Stack space="space.150">
            <Text>
              Precedent comments on this work item and mentions the owner, so they can decide whether "
              {decision.title}" still holds.
            </Text>
            <Stack space="space.050">
              <Label labelFor={getFieldId('note')}>What changed?</Label>
              <TextArea {...register('note')} minimumRows={3} />
            </Stack>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton type="submit" appearance="primary" isLoading={isSending}>
            Send request
          </LoadingButton>
        </ModalFooter>
      </Form>
    </Modal>
  );
};

const App = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState();
  const [source, setSource] = useState(null);
  const [logging, setLogging] = useState(false);
  const [reopenFor, setReopenFor] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () =>
    invoke('getWorkItemView')
      .then(setData)
      .catch((e) => setError(e.message || 'Could not load decisions.'));

  useEffect(() => {
    load();
    view.getContext().then((ctx) => setAccountId(ctx.accountId));
  }, []);

  const respond = async (ref, response, extra = {}) => {
    setBusy(`${ref}:${response}`);
    try {
      await invoke('respond', { ref, response, ...extra });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusy('');
  };

  const openLog = async () => {
    setLogging(true);
    if (!source) setSource(await invoke('getSourceContext'));
  };

  if (error) return <SectionMessage appearance="error">{error}</SectionMessage>;
  if (!data) return <Spinner label="Checking decisions" />;

  const { matches, fromHere } = data;
  const banner = matches.length ? summarize(matches) : null;

  return (
    <Stack space="space.300">
      {banner ? (
        <SectionMessage appearance={banner.appearance} title={banner.title}>
          <Text>{banner.text}</Text>
        </SectionMessage>
      ) : (
        <Text color="color.text.subtle">No active decision touches this work.</Text>
      )}

      {matches.map((m) => {
        const ref = m.decision.ref;
        const done = RESPONSES[m.response];
        return (
          <DecisionCard key={ref} decision={m.decision} match={m}>
            {done ? (
              <Inline space="space.100" alignBlock="center">
                <Lozenge appearance={done.appearance}>{done.label}</Lozenge>
                <Button appearance="subtle" spacing="compact" onClick={() => respond(ref, 'undo')}>
                  Undo
                </Button>
              </Inline>
            ) : m.verdict === 'fits' ? null : (
              <ButtonGroup>
                <LoadingButton
                  appearance="primary"
                  isLoading={busy === `${ref}:follow`}
                  onClick={() => respond(ref, 'follow')}
                >
                  Follow it
                </LoadingButton>
                <Button onClick={() => setReopenFor(m.decision)}>Ask to reopen</Button>
                <LoadingButton
                  appearance="subtle"
                  isLoading={busy === `${ref}:unrelated`}
                  onClick={() => respond(ref, 'unrelated')}
                >
                  Not related
                </LoadingButton>
              </ButtonGroup>
            )}
          </DecisionCard>
        );
      })}

      <Stack space="space.150">
        <Inline spread="space-between" alignBlock="center">
          <Heading size="xsmall" as="h3">
            Decided here
          </Heading>
          <Button spacing="compact" onClick={openLog}>
            Log a decision
          </Button>
        </Inline>
        {fromHere.length === 0 ? (
          <Text size="small" color="color.text.subtle">
            Nothing logged from this work item yet.
          </Text>
        ) : (
          fromHere.map((d) => <DecisionCard key={d.ref} decision={d} />)
        )}
      </Stack>

      <ModalTransition>
        {logging && (
          <Modal onClose={() => setLogging(false)}>
            <ModalHeader>
              <ModalTitle>Log a decision</ModalTitle>
            </ModalHeader>
            <ModalBody>
              {source ? (
                <DecisionForm
                  source={source}
                  initial={{ projectKeys: source.projectKey ? [source.projectKey] : [] }}
                  ownerAccountId={accountId}
                  onCancel={() => setLogging(false)}
                  onSaved={() => {
                    setLogging(false);
                    load();
                  }}
                />
              ) : (
                <Spinner />
              )}
            </ModalBody>
          </Modal>
        )}
        {reopenFor && (
          <ReopenModal
            decision={reopenFor}
            isSending={busy === `${reopenFor.ref}:reopen`}
            onClose={() => setReopenFor(null)}
            onSend={async (note) => {
              await respond(reopenFor.ref, 'reopen', { note });
              setReopenFor(null);
            }}
          />
        )}
      </ModalTransition>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
