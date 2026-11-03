import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Stack,
  Inline,
  Text,
  Heading,
  Toggle,
  Label,
  Textfield,
  HelperMessage,
  LoadingButton,
  SectionMessage,
  Spinner,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const pageStyle = xcss({ padding: 'space.400' });
// Keeps a toggle from being squeezed when its description wraps.
const toggleStyle = xcss({ minWidth: '40px' }); // ds-allow-hardcode: UI Kit has no size token for a toggle's width

const Setting = ({ id, label, description, isChecked, onChange }) => (
  <Inline space="space.200" alignBlock="start">
    <Box xcss={toggleStyle}>
      <Toggle id={id} isChecked={isChecked} onChange={onChange} />
    </Box>
    <Stack space="space.050">
      <Label labelFor={id}>{label}</Label>
      <Text size="small" color="color.text.subtle">
        {description}
      </Text>
    </Stack>
  </Inline>
);

function describeRun({ off, opened, skipped }) {
  if (off) return 'Review work items are turned off. Turn them on and save first.';
  const parts = opened.map((o) => `Opened ${o.issueKey} for ${o.ref}.`);
  for (const s of skipped) {
    parts.push(s.reason === 'no project' ? `${s.ref} has no project. Set a review project above.` : `${s.ref}: ${s.reason}`);
  }
  return parts.join(' ') || 'No decision is due for review.';
}

const App = () => {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    invoke('getSettings').then(setSettings);
  }, []);

  const toggle = (field) => () => setSettings((s) => ({ ...s, [field]: !s[field] }));

  const save = async () => {
    setSaving(true);
    try {
      setSettings(await invoke('saveSettings', settings));
      setMessage({ from: 'save', appearance: 'success', text: 'Settings saved.' });
    } catch (e) {
      setMessage({ from: 'save', appearance: 'error', text: e.message });
    }
    setSaving(false);
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const refs = await invoke('addSamples');
      setMessage({
        from: 'seed',
        appearance: 'success',
        text: refs.length ? `Added ${refs.join(', ')}.` : 'The sample decisions are already there.',
      });
    } catch (e) {
      setMessage({ from: 'seed', appearance: 'error', text: e.message });
    }
    setSeeding(false);
  };

  const runReviews = async () => {
    setRunning(true);
    try {
      const result = await invoke('runReviews');
      setMessage({ from: 'reviews', appearance: result.skipped?.length ? 'warning' : 'success', text: describeRun(result) });
    } catch (e) {
      setMessage({ from: 'reviews', appearance: 'error', text: e.message });
    }
    setRunning(false);
  };

  if (!settings) return <Spinner />;

  return (
    <Box xcss={pageStyle}>
      <Stack space="space.300">
        <Text color="color.text.subtle">
          Precedent checks every new or edited work item against your active decisions.
        </Text>
        <Setting
          id="commentOnConflict"
          label="Comment on likely conflicts"
          description="Add a comment to the work item and mention the decision owner."
          isChecked={settings.commentOnConflict}
          onChange={toggle('commentOnConflict')}
        />
        <Setting
          id="commentOnPossible"
          label="Also comment on related decisions"
          description="Comment when the match is weaker. Off by default to keep work items quiet."
          isChecked={settings.commentOnPossible}
          onChange={toggle('commentOnPossible')}
        />
        <Setting
          id="useAi"
          label="Check matches with AI"
          description="When keywords match, an Atlassian-hosted model judges whether the work goes against the decision, fits it, or is unrelated, and says why. Work item text stays inside Atlassian."
          isChecked={settings.useAi}
          onChange={toggle('useAi')}
        />
        <Setting
          id="suggestFromComments"
          label="Suggest decisions from comments"
          description="When a comment reads like a decision, Precedent offers to log it from the work item. With AI checks on, the model fills in the rule, reason and keywords."
          isChecked={settings.suggestFromComments}
          onChange={toggle('suggestFromComments')}
        />
        <Setting
          id="reviewReminders"
          label="Open review work items"
          description="On a decision's review date, Precedent opens a work item for the owner to keep, replace or expire it."
          isChecked={settings.reviewReminders}
          onChange={toggle('reviewReminders')}
        />
        <Stack space="space.050">
          <Label labelFor="reviewProjectKey">Review project</Label>
          <Textfield
            id="reviewProjectKey"
            name="reviewProjectKey"
            defaultValue={settings.reviewProjectKey}
            placeholder="OPS"
            onChange={(e) => {
              const value = e.target.value;
              setSettings((s) => ({ ...s, reviewProjectKey: value }));
            }}
          />
          <HelperMessage>Project key for review work items. Leave empty to use the project each decision came from.</HelperMessage>
        </Stack>
        <Inline>
          <LoadingButton appearance="primary" isLoading={saving} onClick={save}>
            Save
          </LoadingButton>
        </Inline>
        {message?.from === 'save' && <SectionMessage appearance={message.appearance}>{message.text}</SectionMessage>}
        <Stack space="space.100">
          <Heading size="small" as="h2">
            Reviews due today
          </Heading>
          <Text color="color.text.subtle">
            Precedent checks once a day. Check now to open review work items for decisions that are due.
          </Text>
          <Inline>
            <LoadingButton isLoading={running} onClick={runReviews}>
              Check for due reviews
            </LoadingButton>
          </Inline>
          {message?.from === 'reviews' && (
            <SectionMessage appearance={message.appearance}>{message.text}</SectionMessage>
          )}
        </Stack>
        <Stack space="space.100">
          <Heading size="small" as="h2">
            Try it with sample data
          </Heading>
          <Text color="color.text.subtle">
            Adds four decisions from a small online store. Then create a work item called "Black Friday: free
            shipping on everything" and open Precedent on it.
          </Text>
          <Inline>
            <LoadingButton isLoading={seeding} onClick={seed}>
              Add sample decisions
            </LoadingButton>
          </Inline>
          {message?.from === 'seed' && (
            <SectionMessage appearance={message.appearance}>{message.text}</SectionMessage>
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
