import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Stack,
  Inline,
  Text,
  Heading,
  Button,
  LoadingButton,
  SectionMessage,
  Spinner,
  xcss,
} from '@forge/react';
import { invoke, view } from '@forge/bridge';
import { DecisionForm } from './components';

const itemStyle = xcss({
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius.200',
  padding: 'space.150',
});

const waiting = (n) => (n === 1 ? "This decision isn't" : `These ${n} decisions aren't`);

// Confluence "Log a decision" action: opens in a modal from the page's ••• menu.
// Decisions already written on the page (typed with /decision) and not logged
// yet are listed first, each with Log it and Skip. Otherwise it opens a blank form.
const App = () => {
  const [source, setSource] = useState(null);
  const [accountId, setAccountId] = useState();
  const [page, setPage] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');

  const loadPage = () =>
    invoke('getPageDecisions').then((d) => {
      setPage(d);
      return d;
    });

  useEffect(() => {
    Promise.all([invoke('getSourceContext').then(setSource), loadPage()])
      .then(([, d]) => {
        if (!d.items.length && !d.skipped.length) setForm({});
      })
      .catch((e) => setError(e.message));
    view.getContext().then((ctx) => setAccountId(ctx.accountId));
  }, []);

  const draft = async (item) => {
    setBusy(`${item.localId}:draft`);
    try {
      const initial = await invoke('draftPageDecision', { localId: item.localId });
      setForm({ initial, sourceItemId: initial.sourceItemId });
    } catch (e) {
      setError(e.message);
    }
    setBusy('');
  };

  const skip = async (item, value) => {
    setBusy(`${item.localId}:skip`);
    try {
      await invoke('skipPageItem', { localId: item.localId, skip: value });
      await loadPage();
    } catch (e) {
      setError(e.message);
    }
    setBusy('');
  };

  const onSaved = async (decision) => {
    setSaved(decision);
    setForm(null);
    await loadPage();
  };

  if (error) return <SectionMessage appearance="error">{error}</SectionMessage>;
  if (!source || !page) return <Spinner label="Reading the page" />;

  const hasList = page.items.length > 0 || page.skipped.length > 0;

  if (form) {
    return (
      <DecisionForm
        source={form.sourceItemId ? { ...source, sourceItemId: form.sourceItemId } : source}
        initial={form.initial || {}}
        ownerAccountId={accountId}
        onCancel={() => (hasList ? setForm(null) : view.close())}
        onSaved={onSaved}
      />
    );
  }

  return (
    <Stack space="space.200">
      {saved && (
        <SectionMessage appearance="success" title={`Logged as ${saved.ref}`}>
          <Text>Precedent will flag new Jira work that touches "{saved.title}".</Text>
        </SectionMessage>
      )}
      {page.items.length > 0 && (
        <Stack space="space.150">
          <Heading size="xsmall" as="h3">
            Decisions on this page
          </Heading>
          <Text color="color.text.subtle">
            {waiting(page.items.length)} logged yet. Log them so new Jira work is checked against them.
          </Text>
          {page.items.map((item) => (
            <Box key={item.localId} xcss={itemStyle}>
              <Stack space="space.100">
                <Text>{item.text}</Text>
                <Inline space="space.100">
                  <LoadingButton
                    appearance="primary"
                    isLoading={busy === `${item.localId}:draft`}
                    onClick={() => draft(item)}
                  >
                    Log it
                  </LoadingButton>
                  <LoadingButton
                    appearance="subtle"
                    isLoading={busy === `${item.localId}:skip`}
                    onClick={() => skip(item, true)}
                  >
                    Skip
                  </LoadingButton>
                </Inline>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
      {page.skipped.length > 0 && (
        <Stack space="space.100">
          <Text size="small" color="color.text.subtle">
            Skipped on this page
          </Text>
          {page.skipped.map((item) => (
            <Inline key={item.localId} space="space.100" alignBlock="center" spread="space-between">
              <Text size="small" color="color.text.subtle">
                {item.text}
              </Text>
              <LoadingButton
                appearance="subtle"
                isLoading={busy === `${item.localId}:skip`}
                onClick={() => skip(item, false)}
              >
                Bring back
              </LoadingButton>
            </Inline>
          ))}
        </Stack>
      )}
      <Inline space="space.100">
        <Button appearance="subtle" onClick={() => setForm({})}>
          {hasList ? 'Log a different decision' : 'Log another decision'}
        </Button>
        <Button appearance="primary" onClick={() => view.close()}>
          Done
        </Button>
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
