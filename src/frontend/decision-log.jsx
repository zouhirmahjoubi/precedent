import React, { useEffect, useMemo, useState } from 'react';
import ForgeReconciler, {
  Box,
  Stack,
  Inline,
  Text,
  Heading,
  Button,
  LoadingButton,
  Textfield,
  Select,
  Label,
  DynamicTable,
  EmptyState,
  Spinner,
  SectionMessage,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  User,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  xcss,
} from '@forge/react';
import { invoke, view } from '@forge/bridge';
import { DecisionCard, DecisionForm, StatusLozenge, formatDate, recordLine } from './components';

const pageStyle = xcss({ padding: 'space.400' });

const tileStyle = xcss({
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius.200',
  paddingBlock: 'space.200',
  paddingInline: 'space.300',
  backgroundColor: 'elevation.surface',
});

const StatTile = ({ value, label }) => (
  <Box xcss={tileStyle}>
    <Stack space="space.050">
      <Heading size="large" as="h2">
        {String(value)}
      </Heading>
      <Text size="small" color="color.text.subtle">
        {label}
      </Text>
    </Stack>
  </Box>
);

const TABS = [
  { key: 'active', label: 'Active', filter: (d) => d.status === 'active' },
  { key: 'due', label: 'Due for review', filter: (d, due) => due.includes(d.ref) },
  { key: 'closed', label: 'Replaced and expired', filter: (d) => d.status !== 'active' },
  { key: 'all', label: 'All', filter: () => true },
];

const HEAD = {
  cells: [
    { key: 'ref', content: 'Ref', isSortable: true },
    { key: 'title', content: 'Decision', isSortable: true },
    { key: 'owner', content: 'Owner' },
    { key: 'decided', content: 'Decided', isSortable: true },
    { key: 'review', content: 'Review by', isSortable: true },
    { key: 'caught', content: 'Caught', isSortable: true },
    { key: 'status', content: 'Status' },
  ],
};

const HISTORY_LABEL = {
  logged: 'Logged',
  edited: 'Edited',
  followed: 'Followed on',
  'reopen requested': 'Reopen requested on',
  active: 'Made active again',
  replaced: 'Replaced',
  expired: 'Expired',
  kept: 'Kept after review',
  'review opened': 'Review opened in',
};

const DecisionDetail = ({ decision, decisions, accountId, onClose, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [replaceWith, setReplaceWith] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const setStatus = async (status) => {
    setBusy(status);
    setError('');
    try {
      await invoke('setStatus', { ref: decision.ref, status, replacedBy: replaceWith?.value });
      onChanged();
    } catch (e) {
      setError(e.message);
    }
    setBusy('');
  };

  const replacements = decisions
    .filter((d) => d.status === 'active' && d.ref !== decision.ref)
    .map((d) => ({ label: `${d.ref} ${d.title}`, value: d.ref }));

  return (
    <Modal onClose={onClose} width="large">
      <ModalHeader>
        <ModalTitle>{editing ? `Edit ${decision.ref}` : decision.ref}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {editing ? (
          <DecisionForm
            initial={decision}
            ownerAccountId={accountId}
            onCancel={() => setEditing(false)}
            onSaved={onChanged}
          />
        ) : (
          <Stack space="space.300">
            <DecisionCard decision={decision} />
            <Text>{recordLine(decision)}</Text>
            {decision.status === 'active' && replacements.length > 0 && (
              <Stack space="space.050">
                <Label labelFor="replace">Replace with</Label>
                <Select
                  inputId="replace"
                  options={replacements}
                  value={replaceWith}
                  onChange={setReplaceWith}
                  placeholder="Pick the decision that replaces this one"
                />
              </Stack>
            )}
            <Stack space="space.100">
              <Heading size="xsmall" as="h3">
                History
              </Heading>
              <List type="unordered">
                {(decision.history || [])
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <ListItem key={i}>
                      <Inline space="space.100" alignBlock="center" shouldWrap>
                        <Text>
                          {HISTORY_LABEL[h.action] || h.action}
                          {h.note ? ` ${h.note}` : ''}
                          {h.replacedBy ? ` by ${h.replacedBy}` : ''}
                        </Text>
                        {h.by && <User accountId={h.by} />}
                        <Text size="small" color="color.text.subtle">
                          {formatDate(h.at)}
                        </Text>
                      </Inline>
                    </ListItem>
                  ))}
              </List>
            </Stack>
            {error && <SectionMessage appearance="error">{error}</SectionMessage>}
          </Stack>
        )}
      </ModalBody>
      {!editing && (
        <ModalFooter>
          <Button appearance="subtle" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {decision.status === 'active' ? (
            <>
              <LoadingButton isLoading={busy === 'expired'} onClick={() => setStatus('expired')}>
                Mark expired
              </LoadingButton>
              <LoadingButton
                appearance="primary"
                isDisabled={!replaceWith}
                isLoading={busy === 'replaced'}
                onClick={() => setStatus('replaced')}
              >
                Mark replaced
              </LoadingButton>
            </>
          ) : (
            <LoadingButton appearance="primary" isLoading={busy === 'active'} onClick={() => setStatus('active')}>
              Make active again
            </LoadingButton>
          )}
        </ModalFooter>
      )}
    </Modal>
  );
};

const App = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState(null);
  const [logging, setLogging] = useState(false);

  const load = () =>
    invoke('getOverview')
      .then(setData)
      .catch((e) => setError(e.message || 'Could not load decisions.'));

  useEffect(() => {
    load();
    view.getContext().then((ctx) => setAccountId(ctx.accountId));
  }, []);

  const rowsFor = useMemo(
    () => (tabDef) => {
      if (!data) return [];
      const q = query.trim().toLowerCase();
      return data.decisions
        .filter((d) => tabDef.filter(d, data.due))
        .filter(
          (d) => !q || [d.ref, d.title, d.rationale, ...(d.keywords || [])].some((f) => String(f || '').toLowerCase().includes(q))
        )
        .map((d) => ({
          key: d.ref,
          cells: [
            {
              key: d.number || 0,
              content: (
                <Button appearance="link" spacing="none" onClick={() => setSelected(d.ref)}>
                  {d.ref}
                </Button>
              ),
            },
            { key: d.title, content: <Text>{d.title}</Text> },
            { key: 'owner', content: d.ownerAccountId ? <User accountId={d.ownerAccountId} /> : '' },
            { key: d.decidedOn || '', content: formatDate(d.decidedOn) },
            { key: d.reviewBy || '9999', content: formatDate(d.reviewBy) || 'None' },
            { key: d.caughtCount || 0, content: String(d.caughtCount || 0) },
            { key: d.status, content: <StatusLozenge status={d.status} /> },
          ],
        }));
    },
    [data, query]
  );

  if (error) {
    return (
      <Box xcss={pageStyle}>
        <SectionMessage appearance="error">{error}</SectionMessage>
      </Box>
    );
  }
  if (!data) {
    return (
      <Box xcss={pageStyle}>
        <Spinner label="Loading decisions" />
      </Box>
    );
  }

  const selectedDecision = data.decisions.find((d) => d.ref === selected);

  return (
    <Box xcss={pageStyle}>
      <Stack space="space.400">
        <Inline spread="space-between" alignBlock="center" shouldWrap>
          <Text color="color.text.subtle">What your team decided, why, and where it applies.</Text>
          <Button appearance="primary" onClick={() => setLogging(true)}>
            Log a decision
          </Button>
        </Inline>

        <Inline space="space.200" shouldWrap>
          <StatTile value={data.stats.active} label="Active decisions" />
          <StatTile value={data.stats.due} label="Due for review in 30 days" />
          <StatTile value={data.stats.caught} label="Times new work was flagged" />
          <StatTile value={data.stats.followed} label="Times a flag was followed" />
        </Inline>

        <Textfield
          name="search"
          placeholder="Search decisions, reasons and keywords"
          onChange={(e) => setQuery(e.target.value)}
        />

        <Tabs id="decision-tabs" selected={tab} onChange={setTab}>
          <TabList>
            {TABS.map((t) => (
              <Tab key={t.key}>{t.label}</Tab>
            ))}
          </TabList>
          {TABS.map((t) => (
            <TabPanel key={t.key}>
              <Box xcss={xcss({ paddingTop: 'space.200', width: '100%' })}>
                <DynamicTable
                  head={HEAD}
                  rows={rowsFor(t)}
                  rowsPerPage={20}
                  emptyView={
                    <EmptyState
                      header={data.decisions.length ? 'Nothing here' : 'No decisions yet'}
                      description={
                        data.decisions.length
                          ? 'Try another tab or search.'
                          : 'Log the first decision your team made, or open a work item and log one from there.'
                      }
                    />
                  }
                />
              </Box>
            </TabPanel>
          ))}
        </Tabs>
      </Stack>

      <ModalTransition>
        {selectedDecision && (
          <DecisionDetail
            decision={selectedDecision}
            decisions={data.decisions}
            accountId={accountId}
            onClose={() => setSelected(null)}
            onChanged={() => {
              setSelected(null);
              load();
            }}
          />
        )}
        {logging && (
          <Modal onClose={() => setLogging(false)}>
            <ModalHeader>
              <ModalTitle>Log a decision</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <DecisionForm
                source={{ sourceType: 'manual' }}
                ownerAccountId={accountId}
                onCancel={() => setLogging(false)}
                onSaved={() => {
                  setLogging(false);
                  load();
                }}
              />
            </ModalBody>
          </Modal>
        )}
      </ModalTransition>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
