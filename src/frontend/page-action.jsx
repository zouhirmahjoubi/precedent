import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Stack, Text, Button, SectionMessage, Spinner } from '@forge/react';
import { invoke, view } from '@forge/bridge';
import { DecisionForm } from './components';

// Confluence "Log a decision" action: opens in a modal from the page's ••• menu.
const App = () => {
  const [source, setSource] = useState(null);
  const [accountId, setAccountId] = useState();
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    invoke('getSourceContext')
      .then(setSource)
      .catch((e) => setError(e.message));
    view.getContext().then((ctx) => setAccountId(ctx.accountId));
  }, []);

  if (error) return <SectionMessage appearance="error">{error}</SectionMessage>;
  if (!source) return <Spinner label="Reading the page" />;

  if (saved) {
    return (
      <Stack space="space.200">
        <SectionMessage appearance="success" title={`Logged as ${saved.ref}`}>
          <Text>Precedent will flag new Jira work that touches "{saved.title}".</Text>
        </SectionMessage>
        <Button appearance="primary" onClick={() => view.close()}>
          Done
        </Button>
      </Stack>
    );
  }

  return (
    <DecisionForm source={source} ownerAccountId={accountId} onCancel={() => view.close()} onSaved={setSaved} />
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
