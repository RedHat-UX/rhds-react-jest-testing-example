/**
 * Application-level tests for the RHDS React wrappers.
 *
 * Ground rules demonstrated here:
 *
 * 1. No test ever reads a shadow root. Every assertion targets the custom
 *    element host (`properties`, `attributes`), a custom event, or light-DOM
 *    slotted content found by a normal Testing Library query.
 * 2. No `@rhds/elements` module is mocked. The tests run the real components,
 *    upgraded in JSDOM by the harness in `jest.setup.ts`.
 * 3. Interactions happen at the host boundary. RTL cannot and should not click
 *    a button inside a shadow root; the application owns the click handler on
 *    the host, so clicking the host is the correct contract to test.
 */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeploymentManager } from './DeploymentManager';

import type { RhAlert } from '@rhds/elements/rh-alert/rh-alert.js';
import type { RhButton } from '@rhds/elements/rh-button/rh-button.js';
import type { RhDialog } from '@rhds/elements/rh-dialog/rh-dialog.js';
import type { RhSwitch } from '@rhds/elements/rh-switch/rh-switch.js';
import type { RhTag } from '@rhds/elements/rh-tag/rh-tag.js';

type User = ReturnType<typeof userEvent.setup>;

const getSwitch = (): RhSwitch => screen.getByTestId<RhSwitch>('maintenance-switch');
const getRollbackButton = (): RhButton => screen.getByTestId<RhButton>('rollback-button');
const getDialog = (): RhDialog => screen.getByTestId<RhDialog>('rollback-dialog');

/** Turn the switch on and wait for React state to reach the host element. */
async function enableMaintenance(user: User) {
  await user.click(getSwitch());

  // The custom element reflects its own property to an attribute. Waiting on
  // the host (rather than on internals) keeps this assertion public.
  await waitFor(() => expect(getSwitch().checked).toBe(true));
  await waitFor(() => expect(getRollbackButton().disabled).toBe(false));
}

/** Toggle maintenance on, then open the dialog through the React ref. */
async function openRollbackDialog(user: User) {
  await enableMaintenance(user);
  await user.click(getRollbackButton());

  await waitFor(() => expect(getDialog().open).toBe(true));
}

/** Confirm the rollback and wait for the success alert. */
async function rollBack(user: User) {
  await openRollbackDialog(user);
  await user.click(screen.getByTestId('confirm-rollback'));
  await screen.findByTestId('rollback-alert');
}

describe('DeploymentManager with real @rhds/elements', () => {
  it('upgrades the real custom elements and renders slotted light-DOM text', () => {
    render(<DeploymentManager />);

    // The design system registered these elements; they are not stand-ins.
    for (const tag of ['rh-card', 'rh-button', 'rh-switch', 'rh-dialog', 'rh-alert', 'rh-tag']) {
      expect(customElements.get(tag)).toBeDefined();
    }

    const card = screen.getByTestId('deployment-card');
    expect(card.tagName).toBe('RH-CARD');
    expect(card).toBeInstanceOf(HTMLElement);

    // `<h2 slot="header">` and the body paragraphs are light DOM children of
    // the card host. `getByText` finds them without crossing a shadow boundary.
    expect(screen.getByText('checkout-api')).toBeInTheDocument();
    expect(screen.getByTestId('deployment-version')).toHaveTextContent('v2.4.1');
    expect(screen.getByText('Roll back deployment')).toBeInTheDocument();
  });

  it('drives host properties and attributes from React state', async () => {
    render(<DeploymentManager />);

    const rollback = getRollbackButton();

    // React state starts with maintenance off, so the public `disabled`
    // property is true and Lit reflects it to the identical attribute.
    await waitFor(() => expect(rollback.disabled).toBe(true));
    expect(rollback).toHaveAttribute('disabled');
    expect(rollback.danger).toBe(false);
    expect(rollback).toHaveAttribute('variant', 'secondary');
    expect(getSwitch()).not.toHaveAttribute('checked');
  });

  it('reacts to the switch custom event and re-derives host properties', async () => {
    const user = userEvent.setup();
    render(<DeploymentManager />);

    await enableMaintenance(user);

    const rollback = getRollbackButton();

    // The `change` event from `<rh-switch>` updated React state; the new state
    // is then written back to `<rh-button>` as public properties.
    expect(getSwitch().checked).toBe(true);
    expect(getSwitch()).toHaveAttribute('checked');

    await waitFor(() => expect(rollback.danger).toBe(true));
    expect(rollback).toHaveAttribute('danger');
    expect(rollback).toHaveAttribute('variant', 'primary');
    expect(rollback).not.toHaveAttribute('disabled');
  });

  it('opens the dialog through its public imperative method', async () => {
    const user = userEvent.setup();
    render(<DeploymentManager />);

    await openRollbackDialog(user);

    const dialog = getDialog();

    // `open` is a documented host property, reflected as an attribute. The
    // test does not look at the native <dialog> inside the shadow root.
    expect(dialog.open).toBe(true);
    expect(dialog).toHaveAttribute('open');

    // Header/footer/body content lives in light DOM slots, so a plain query
    // scoped to the host finds it.
    expect(within(dialog).getByText('Roll back deployment?')).toBeInTheDocument();
    expect(
      within(dialog).getByText('This restores the previous release and routes new traffic to it.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId('confirm-rollback')).toBeInTheDocument();
    expect(within(dialog).getByTestId('cancel-rollback')).toBeInTheDocument();
  });

  it('closes without an alert when the user cancels', async () => {
    const user = userEvent.setup();
    render(<DeploymentManager />);

    await openRollbackDialog(user);
    await user.click(screen.getByTestId('cancel-rollback'));

    // `close()` emits the bubbling custom `close` event; React state follows.
    await waitFor(() => expect(getDialog().open).toBe(false));
    expect(getDialog()).not.toHaveAttribute('open');
    expect(screen.queryByTestId('rollback-alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('deployment-version')).toHaveTextContent('v2.4.1');
  });

  it('confirming communicates through the close event and returnValue', async () => {
    const user = userEvent.setup();
    render(<DeploymentManager />);

    await openRollbackDialog(user);
    await user.click(screen.getByTestId('confirm-rollback'));

    const alert = await screen.findByTestId<RhAlert>('rollback-alert');

    // The dialog reported its result through the public `returnValue`
    // property, and the app translated that into new state.
    expect(getDialog().returnValue).toBe('rollback');
    await waitFor(() => expect(getDialog().open).toBe(false));

    // The alert's state and content are public API: a reflected attribute and
    // slotted header/body text that Testing Library can query directly.
    expect(alert.state).toBe('success');
    expect(alert).toHaveAttribute('state', 'success');
    expect(within(alert).getByText('Deployment rolled back')).toBeInTheDocument();
    expect(within(alert).getByText('checkout-api is now running v2.4.0.')).toBeInTheDocument();

    // The card body is driven by the same application state.
    expect(screen.getByTestId('deployment-version')).toHaveTextContent('v2.4.0');
  });

  it('removes the alert when the design system dispatches its close event', async () => {
    const user = userEvent.setup();
    render(<DeploymentManager />);

    await openRollbackDialog(user);
    await user.click(screen.getByTestId('confirm-rollback'));

    const alert = await screen.findByTestId('rollback-alert');

    // Poking the alert's internal close button would mean piercing the shadow
    // root. Dispatching the documented `close` event on the host is the
    // supported custom-element contract and exercises the app's reaction.
    act(() => {
      alert.dispatchEvent(new Event('close', { bubbles: true }));
    });

    expect(screen.queryByTestId('rollback-alert')).not.toBeInTheDocument();
  });

  it('reflects rollback in the status tag and release-history marker', async () => {
    const user = userEvent.setup();
    render(<DeploymentManager />);

    const statusTag = screen.getByTestId<RhTag>('deployment-status');
    expect(statusTag).toHaveTextContent('Healthy');
    expect(statusTag.color).toBe('green');
    expect(statusTag.variant).toBe('filled');

    // The current release marker is light DOM owned by the app, so its text
    // relationship is part of the application's public markup.
    expect(screen.getByText('Current').closest('li')).toHaveTextContent('v2.4.1');

    await rollBack(user);

    const updatedStatusTag = screen.getByTestId<RhTag>('deployment-status');
    expect(updatedStatusTag).toHaveTextContent('Rolled back');
    expect(updatedStatusTag.color).toBe('orange');
    expect(screen.getByText('Current').closest('li')).toHaveTextContent('v2.4.0');
  });

  it('renders deployment metadata and switch-dependent helper text', async () => {
    const user = userEvent.setup();
    render(<DeploymentManager />);

    for (const value of ['payments-prod', 'us-east-1', '6 of 6 ready', 'Rolling update']) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }

    const disabledNote = 'Turn on maintenance mode to enable rollback.';
    expect(screen.getByText(disabledNote)).toBeInTheDocument();

    await enableMaintenance(user);

    await waitFor(() =>
      expect(screen.getByText('Maintenance mode is on. Rollback is available.')).toBeInTheDocument(),
    );
    expect(screen.queryByText(disabledNote)).not.toBeInTheDocument();
  });

  it('shows current and target versions in the dialog before and after rollback', async () => {
    const user = userEvent.setup();
    render(<DeploymentManager />);

    await openRollbackDialog(user);

    expect(within(getDialog()).getByText(/Current version: v2\.4\.1/)).toBeInTheDocument();
    expect(within(getDialog()).getByText(/Target version: v2\.4\.0/)).toBeInTheDocument();

    await user.click(screen.getByTestId('confirm-rollback'));
    await screen.findByTestId('rollback-alert');

    // Reopen the dialog after the rollback: the copy now describes the
    // reverse operation, driven by the same application state.
    await user.click(getRollbackButton());
    await waitFor(() => expect(getDialog().open).toBe(true));

    expect(within(getDialog()).getByText(/Current version: v2\.4\.0/)).toBeInTheDocument();
    expect(within(getDialog()).getByText(/Target version: v2\.4\.1/)).toBeInTheDocument();
  });
});
