import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Stack, Text, SectionMessage, Spinner } from '@forge/react';
import { invoke } from '@forge/bridge';
import { DecisionCard } from './components';

const waiting = (n) => (n === 1 ? "1 decision on this page isn't" : `${n} decisions on this page aren't`);

// Byline popup on a Confluence page: decisions logged from this page, and how
// many of the page's own decision items are still waiting to be logged.
const App = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    invoke('getPageDecisions')
      .then(setData)
      .catch((e) => setError(e.message || 'Could not read this page.'));
  }, []);

  if (error) return <SectionMessage appearance="error">{error}</SectionMessage>;
  if (!data) return <Spinner />;
  const { logged, items } = data;
  return (
    <Stack space="space.150">
      {items.length > 0 && (
        <SectionMessage appearance="discovery">
          <Text>{waiting(items.length)} logged yet. Use Log a decision in the page menu to log them.</Text>
        </SectionMessage>
      )}
      {logged.length === 0 && items.length === 0 && (
        <Text color="color.text.subtle">No decisions logged from this page yet. Use Log a decision in the page menu.</Text>
      )}
      {logged.map((d) => (
        <DecisionCard key={d.ref} decision={d} />
      ))}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
