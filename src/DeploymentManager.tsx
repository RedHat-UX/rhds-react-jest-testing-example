import { useRef, useState } from 'react';

import { Alert } from '@rhds/elements/react/rh-alert/rh-alert.js';
import { Button } from '@rhds/elements/react/rh-button/rh-button.js';
import { Card } from '@rhds/elements/react/rh-card/rh-card.js';
import { Dialog } from '@rhds/elements/react/rh-dialog/rh-dialog.js';
import { Switch } from '@rhds/elements/react/rh-switch/rh-switch.js';
import { Tag } from '@rhds/elements/react/rh-tag/rh-tag.js';

import type { RhDialog } from '@rhds/elements/rh-dialog/rh-dialog.js';
import type { RhSwitch } from '@rhds/elements/rh-switch/rh-switch.js';

type DeploymentStatus = 'healthy' | 'rolled-back';

/**
 * A small, realistic feature that consumes six RHDS React wrappers.
 *
 * Every interaction below uses the custom element's public API:
 *
 * - state is passed down as properties (`disabled`, `danger`, `checked`, `open`)
 * - the design system talks back through custom events (`change`, `close`)
 * - the app opens the dialog through `RhDialog.showModal()`, a public method
 * - slotted content is ordinary light DOM, so RTL queries find it directly
 *
 * Nothing here reaches into a shadow root, and nothing here imports a mock.
 */
export function DeploymentManager() {
  const dialogRef = useRef<RhDialog>(null);

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState<DeploymentStatus>('healthy');
  const [alertVisible, setAlertVisible] = useState(false);

  const canRollBack = maintenanceMode;
  const version = status === 'rolled-back' ? 'v2.4.0' : 'v2.4.1';
  const isRolledBack = status === 'rolled-back';

  /**
   * `change` is dispatched by `<rh-switch>` as a custom event. Reading
   * `checked` from the host element keeps the test (and the app) at the public
   * boundary instead of poking at the internal checkbox.
   */
  function handleMaintenanceChange(event: Event) {
    const switchElement = event.target as RhSwitch;
    setMaintenanceMode(switchElement.checked);
  }

  function openRollbackDialog() {
    if (!canRollBack) {
      return;
    }

    // Public imperative method from the custom elements manifest.
    dialogRef.current?.showModal();
    setDialogOpen(true);
  }

  function cancelRollback() {
    // Public imperative method; the resulting `close` event resets React state.
    dialogRef.current?.close();
  }

  function confirmRollback() {
    // `close(value)` records the dialog's public `returnValue`.
    dialogRef.current?.close('rollback');
  }

  /**
   * `<rh-dialog>` fires a bubbling `close` event after the native dialog
   * closes. `returnValue` is part of the host element's public API.
   */
  function handleDialogClose(event: Event) {
    const dialogElement = event.target as RhDialog;
    setDialogOpen(false);
    setAlertVisible(false);

    if (dialogElement.returnValue === 'rollback') {
      setStatus('rolled-back');
      setAlertVisible(true);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="app-brand">
          <span className="brand-mark" aria-hidden="true">
            RH
          </span>
          <span className="brand-name">Red Hat Design System</span>
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-product">Deployments</span>
        </div>
        <div className="app-bar-actions">
          <span className="env-label">
            <span className="env-dot" aria-hidden="true" />
            production
          </span>
          <Tag variant="outline" color="gray" size="compact">
            React 19 + Jest POC
          </Tag>
        </div>
      </header>

      <main className="page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">
              Production <span aria-hidden="true">/</span> payments-prod
              <span aria-hidden="true"> / </span> us-east-1
            </p>
            <h1>Deployment manager</h1>
            <p className="lede">
              Operate the checkout-api release, toggle maintenance mode, and roll back safely when
              a release goes wrong.
            </p>
          </div>

          <Tag
            data-testid="deployment-status"
            color={isRolledBack ? 'orange' : 'green'}
            variant="filled"
            size="compact"
          >
            {isRolledBack ? 'Rolled back' : 'Healthy'}
          </Tag>
        </section>

        {alertVisible && (
          <Alert
            data-testid="rollback-alert"
            state="success"
            dismissable
            onClose={() => setAlertVisible(false)}
          >
            <h3 slot="header">Deployment rolled back</h3>
            <p>checkout-api is now running {version}.</p>
          </Alert>
        )}

        <div className="layout">
          <Card data-testid="deployment-card" colorPalette="lightest" className="deployment-card">
            <h2 slot="header">checkout-api</h2>

            <div className="deployment-summary">
              <div>
                <p data-testid="deployment-version" className="version-line">
                  Running <strong>{version}</strong> in production.
                </p>
                <p className="muted">Last deployed 2 hours ago by platform-release-bot.</p>
              </div>
              <span
                className={`status-dot ${isRolledBack ? 'status-dot--warn' : 'status-dot--ok'}`}
                aria-hidden="true"
              />
            </div>

            <dl className="meta-grid">
              <div>
                <dt>Namespace</dt>
                <dd>payments-prod</dd>
              </div>
              <div>
                <dt>Region</dt>
                <dd>us-east-1</dd>
              </div>
              <div>
                <dt>Replicas</dt>
                <dd>6 of 6 ready</dd>
              </div>
              <div>
                <dt>Strategy</dt>
                <dd>Rolling update</dd>
              </div>
            </dl>

            <div className={`maintenance-panel ${maintenanceMode ? 'is-active' : ''}`}>
              <div className="maintenance-copy">
                <strong>Maintenance mode</strong>
                <p>Required before a rollback. New traffic is drained while this is on.</p>
              </div>

              <label className="maintenance-toggle">
                <Switch
                  id="maintenance-switch"
                  data-testid="maintenance-switch"
                  checked={maintenanceMode}
                  onChange={handleMaintenanceChange}
                />
                <span className="toggle-state">{maintenanceMode ? 'On' : 'Off'}</span>
              </label>
            </div>

            <div slot="footer" className="card-footer">
              <Button
                data-testid="rollback-button"
                variant={canRollBack ? 'primary' : 'secondary'}
                danger={canRollBack}
                disabled={!canRollBack}
                onClick={openRollbackDialog}
              >
                Roll back deployment
              </Button>
              <span className="footer-note">
                {canRollBack
                  ? 'Maintenance mode is on. Rollback is available.'
                  : 'Turn on maintenance mode to enable rollback.'}
              </span>
            </div>
          </Card>

          <aside className="side-column">
            <Card colorPalette="lighter" className="history-card">
              <h2 slot="header">Release history</h2>

              <ol className="timeline">
                <li className={isRolledBack ? 'timeline-item' : 'timeline-item is-current'}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div>
                    <p className="timeline-title">
                      <strong>v2.4.1</strong>
                      {!isRolledBack && <span className="timeline-badge">Current</span>}
                    </p>
                    <p className="muted">Deployed 2 hours ago</p>
                  </div>
                </li>
                <li className={isRolledBack ? 'timeline-item is-current' : 'timeline-item'}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div>
                    <p className="timeline-title">
                      <strong>v2.4.0</strong>
                      {isRolledBack && <span className="timeline-badge">Current</span>}
                    </p>
                    <p className="muted">Deployed yesterday</p>
                  </div>
                </li>
                <li className="timeline-item is-muted">
                  <span className="timeline-dot" aria-hidden="true" />
                  <div>
                    <p className="timeline-title">
                      <strong>v2.3.9</strong>
                    </p>
                    <p className="muted">Archived 3 days ago</p>
                  </div>
                </li>
              </ol>
            </Card>

            <Card colorPalette="lighter" className="contract-card">
              <h2 slot="header">Testing boundary</h2>
              <ul className="check-list">
                <li>
                  <span aria-hidden="true">✓</span> Real RHDS elements, no design-system mocks
                </li>
                <li>
                  <span aria-hidden="true">✓</span> Host properties and reflected attributes
                </li>
                <li>
                  <span aria-hidden="true">✓</span> Custom events drive React state
                </li>
                <li>
                  <span aria-hidden="true">✓</span> Slots queried as light DOM
                </li>
                <li>
                  <span aria-hidden="true">✓</span> Ref methods for dialog control
                </li>
                <li>
                  <span aria-hidden="true">✓</span> 13 Jest tests, zero shadow-root reads
                </li>
              </ul>
            </Card>
          </aside>
        </div>
      </main>

      <Dialog
        ref={dialogRef}
        data-testid="rollback-dialog"
        accessibleLabel="Roll back checkout-api"
        variant="small"
        open={dialogOpen}
        onClose={handleDialogClose}
      >
        <h2 slot="header">Roll back deployment?</h2>
        <p>This restores the previous release and routes new traffic to it.</p>
        <p className="muted">
          Current version: {version} <span aria-hidden="true">·</span> Target version:{' '}
          {isRolledBack ? 'v2.4.1' : 'v2.4.0'}
        </p>
        <Button
          slot="footer"
          data-testid="cancel-rollback"
          variant="secondary"
          onClick={cancelRollback}
        >
          Cancel
        </Button>
        <Button slot="footer" data-testid="confirm-rollback" danger onClick={confirmRollback}>
          Roll back
        </Button>
      </Dialog>
    </div>
  );
}

export default DeploymentManager;
