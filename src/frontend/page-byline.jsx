import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Stack, Text, Spinner } from '@forge/react';
import { invoke } from '@forge/bridge';
import { DecisionCard } from './components';

// Byline popup on a Confluence page: decisions logged from this page.
const App = () => {
  const [decisions, setDecisions] = useState(null);

  useEffect(() => {
    invoke('listForPage').then(setDecisions);
  }, []);

  if (!decisions) return <Spinner />;
  if (!decisions.length) {
    return (
      <Text color="color.text.subtle">
        No decisions logged from this page yet. Use Log a decision in the page menu.
      </Text>
    );
  }
  return (
    <Stack space="space.150">
      {decisions.map((d) => (
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
