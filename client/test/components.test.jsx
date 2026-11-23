import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConnectionStatus from '../src/components/ConnectionStatus.jsx';
import JoinScreen from '../src/components/JoinScreen.jsx';
import OutputPanel, { describeRun } from '../src/components/OutputPanel.jsx';
import PeoplePanel from '../src/components/PeoplePanel.jsx';
import { cursorCss, listPeople, PEOPLE_COLORS } from '../src/lib/people.js';

describe('JoinScreen', () => {
  it('shows what to fix and focuses the first invalid field', async () => {
    const onJoin = vi.fn();
    render(<JoinScreen onJoin={onJoin} theme="dark" onTheme={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect(screen.getByText(/Enter the name other people will see/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveFocus();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('normalises the room name and joins', async () => {
    const onJoin = vi.fn();
    render(<JoinScreen onJoin={onJoin} theme="dark" onTheme={() => {}} />);
    await userEvent.type(screen.getByLabelText('Your name'), '  Asha  ');
    await userEvent.type(screen.getByLabelText('Room'), 'Team Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect(onJoin).toHaveBeenCalledWith({ room: 'team-alpha', name: 'Asha' });
  });

  it('rejects unsafe room names with the shared rule', async () => {
    render(<JoinScreen onJoin={() => {}} theme="dark" onTheme={() => {}} initialName="Asha" />);
    await userEvent.type(screen.getByLabelText('Room'), '../secret');
    await userEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect(screen.getByText(/letters, numbers and dashes/)).toBeInTheDocument();
    expect(screen.getByLabelText('Room')).toHaveAttribute('aria-invalid', 'true');
  });

  it('creates a readable room name', async () => {
    render(<JoinScreen onJoin={() => {}} theme="dark" onTheme={() => {}} random={() => 0} />);
    await userEvent.click(screen.getByRole('button', { name: 'New room' }));
    expect(screen.getByLabelText('Room')).toHaveValue('amber-otter-100');
  });
});

describe('PeoplePanel', () => {
  const states = new Map([
    [7, { user: { name: 'Ravi', color: PEOPLE_COLORS[0] }, cursor: { line: 12 } }],
    [3, { user: { name: 'Asha', color: PEOPLE_COLORS[1] } }],
    [9, {}],
  ]);

  it('lists you first, then others with the line they are on', () => {
    const people = listPeople(states, 3);
    render(<PeoplePanel people={people} inviteUrl="http://x/?room=a-b" />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Asha' + 'you', 'Ravi' + 'line 12']);
    expect(screen.queryByText(/Only you are here/)).not.toBeInTheDocument();
  });

  it('invites you to share the link when you are alone', () => {
    render(<PeoplePanel people={listPeople(new Map([[3, states.get(3)]]), 3)} inviteUrl="http://x/?room=a-b" />);
    expect(screen.getByText(/Only you are here/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copy invite link' })).toHaveLength(1);
  });
});

describe('OutputPanel', () => {
  it('explains how to run when nothing has run yet', () => {
    render(<OutputPanel run={{}} />);
    expect(screen.getByText(/Press Run, or/)).toBeInTheDocument();
  });

  it('shows stdout, stderr and a plain summary', () => {
    const run = { status: 'done', by: 'Asha', language: 'python', stdout: 'Hello, team\n', stderr: 'warning\n', exitCode: 0, durationMs: 120, runId: 'r1' };
    render(<OutputPanel run={run} />);
    expect(screen.getByText('Asha ran Python, finished in 0.12 s with exit code 0.')).toBeInTheDocument();
    expect(screen.getByText('Hello, team')).toBeInTheDocument();
    expect(screen.getByText('warning')).toHaveClass('stderr');
  });

  it('shows runner errors with their fix', () => {
    render(<OutputPanel run={{ status: 'error', by: 'Ravi', message: 'The code runner at http://localhost:2000 is not reachable (ECONNREFUSED).' }} />);
    expect(screen.getByText(/not reachable/)).toBeInTheDocument();
    expect(describeRun({ status: 'error', by: 'Ravi' })).toBe("Ravi's run did not start.");
  });

  it('describes compile failures and non-zero exits', () => {
    expect(describeRun({ status: 'done', stage: 'compile', language: 'java', exitCode: 1 })).toBe('Java did not compile (exit code 1).');
    expect(describeRun({ status: 'done', by: 'Asha', language: 'cpp', exitCode: 3, durationMs: 1000 })).toBe('Asha ran C++, stopped in 1.00 s with exit code 3.');
  });
});

describe('ConnectionStatus and cursors', () => {
  it('says the connection state in words', () => {
    const { rerender } = render(<ConnectionStatus status="live" />);
    expect(screen.getByRole('status')).toHaveTextContent('Live');
    rerender(<ConnectionStatus status="reconnecting" />);
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…');
  });

  it('writes cursor CSS only for other people, with the name as a safe CSS string', () => {
    const css = cursorCss([
      { clientId: 1, name: 'Me', color: PEOPLE_COLORS[0], isSelf: true },
      { clientId: 2, name: 'Ravi "R"', color: PEOPLE_COLORS[1], isSelf: false },
    ]);
    expect(css).not.toContain('yRemoteSelectionHead-1');
    expect(css).toContain('.yRemoteSelectionHead-2::after { content: "Ravi \\"R\\""; }');
  });
});
