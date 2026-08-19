import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Page } from "~/components/page";
import { investmentsRepository } from "~/data/repositories/investments-repository";
import {
  asMinorUnits,
  formatMinorUnits,
  parseDisplayAmountToMinor,
} from "~/domain/money";
import { buildInvestmentsReadModel } from "~/read-models/investments";
import { userFacingError } from "~/user-facing-error";
function money(value: number, currency: string) {
  return formatMinorUnits(asMinorUnits(Math.trunc(value)), currency);
}
function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function errorMessage(value: unknown) {
  return userFacingError(value, "The valuation could not be saved.");
}
export default function InvestmentsRoute() {
  const qc = useQueryClient(),
    workspace = useQuery({
      queryKey: ["investments-workspace"],
      queryFn: () => investmentsRepository.getWorkspace(),
    }),
    model = useMemo(
      () => (workspace.data ? buildInvestmentsReadModel(workspace.data) : null),
      [workspace.data],
    ),
    [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null);
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["investments-workspace"] }),
      qc.invalidateQueries({ queryKey: ["analytics-workspace"] }),
      qc.invalidateQueries({ queryKey: ["net-worth"] }),
    ]);
  const save = useMutation({
      mutationFn: async (form: HTMLFormElement) => {
        const data = new FormData(form),
          input = {
            valueMinor: Number(
              parseDisplayAmountToMinor(String(data.get("value"))),
            ),
            valuedAt: new Date(String(data.get("valuedAt"))).toISOString(),
            notes: String(data.get("notes") || "") || null,
          };
        if (editing)
          return investmentsRepository.updateSnapshot(editing, input);
        return investmentsRepository.createSnapshot({
          accountId: String(data.get("accountId")),
          ...input,
        });
      },
      onSuccess: async () => {
        setEditing(null);
        await invalidate();
      },
    }),
    remove = useMutation({
      mutationFn: investmentsRepository.removeSnapshot,
      onSuccess: invalidate,
    });
  if (!model)
    return (
      <Page
        eyebrow="Long-term position"
        title="Investments"
        description="Loading portfolio value and contribution history…"
      />
    );
  const c = model.currency,
    current = model.positions.find(
      (row) => row.accountId === (selected ?? model.positions[0]?.accountId),
    ),
    history = current ? model.history(current.accountId) : [],
    contributions = current ? model.contributions(current.accountId) : [],
    edit = model.snapshots.find((row) => row.id === editing);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate(event.currentTarget);
  };
  return (
    <Page
      eyebrow="Long-term position"
      title="Investments"
      description="Market value is recorded separately from cash movement. Contributions and withdrawals remain authoritative ledger transfers."
    >
      <section className="position-grid">
        <article>
          <span>Portfolio value</span>
          <strong>{money(model.totals.marketValueMinor, c)}</strong>
        </article>
        <article>
          <span>Contributed principal</span>
          <strong>{money(model.totals.principalMinor, c)}</strong>
        </article>
        <article>
          <span>Gain / loss</span>
          <strong
            className={model.totals.gainMinor < 0 ? "negative" : "positive"}
          >
            {money(model.totals.gainMinor, c)}
          </strong>
        </article>
        <article>
          <span>Ledger book value</span>
          <strong>{money(model.totals.bookValueMinor, c)}</strong>
          <small>
            Valuation adjustment{" "}
            {money(model.totals.valuationAdjustmentMinor, c)}
          </small>
        </article>
      </section>
      {!model.positions.length ? (
        <section className="money-panel empty-state">
          <h2>No investment accounts yet</h2>
          <p>
            Create an investment account first. Add money through a transfer,
            then record a portfolio value without creating a transaction.
          </p>
          <Link className="primary-button" to="/money/accounts">
            Create investment account
          </Link>
        </section>
      ) : (
        <div className="overview-two">
          <section className="money-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Accounts</p>
                <h2>Portfolio accounts</h2>
              </div>
              <Link to="/money/transactions">Transfer money →</Link>
            </div>
            <div className="account-list">
              {model.positions.map((row) => (
                <button
                  type="button"
                  className={`account-main ${current?.accountId === row.accountId ? "selected" : ""}`}
                  key={row.accountId}
                  onClick={() => setSelected(row.accountId)}
                >
                  <span>
                    <strong>{row.name}</strong>
                    <small>
                      {row.latestSnapshot
                        ? `Valued ${row.latestSnapshot.valuedAt.slice(0, 10)}`
                        : "Using ledger book value"}
                    </small>
                  </span>
                  <span>
                    {money(row.marketValueMinor, c)}
                    <small>
                      {row.gainRate == null
                        ? "No principal yet"
                        : `${(row.gainRate * 100).toFixed(1)}% gain/loss`}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="money-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Manual valuation</p>
                <h2>
                  {editing
                    ? "Correct recorded value"
                    : "Update portfolio value"}
                </h2>
              </div>
            </div>
            <form className="money-form" onSubmit={onSubmit}>
              <label>
                Investment account
                <select
                  name="accountId"
                  defaultValue={edit?.accountId ?? current?.accountId}
                  disabled={Boolean(editing)}
                >
                  {model.positions.map((row) => (
                    <option value={row.accountId} key={row.accountId}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Portfolio value
                <input
                  name="value"
                  required
                  inputMode="decimal"
                  defaultValue={edit ? String(edit.valueMinor / 100) : ""}
                  placeholder="0.00"
                />
              </label>
              <label>
                Valued at
                <input
                  name="valuedAt"
                  type="datetime-local"
                  required
                  defaultValue={edit ? edit.valuedAt.slice(0, 16) : localNow()}
                />
              </label>
              <label>
                Note <span className="optional">optional</span>
                <input
                  name="notes"
                  maxLength={1000}
                  defaultValue={edit?.notes ?? ""}
                  placeholder="Broker statement or manual check"
                />
              </label>
              <p className="form-help">
                Saving this value does not create a ledger transaction or change
                contribution principal.
              </p>
              {save.error ? (
                <p className="field-error" role="alert">
                  {errorMessage(save.error)}
                </p>
              ) : null}
              <div className="row-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={save.isPending}
                >
                  {save.isPending
                    ? "Saving…"
                    : editing
                      ? "Save correction"
                      : "Record value"}
                </button>
                {editing ? (
                  <button type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      )}
      {current ? (
        <section className="chart-card">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Recorded history</p>
              <h2>{current.name}</h2>
            </div>
            <span>Current gain {money(current.gainMinor, c)}</span>
          </div>
          {history.length ? (
            <>
              <div className="analytics-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                    />
                    <Tooltip formatter={(v) => money(Number(v), c)} />
                    <Legend />
                    <Line
                      dataKey="valueMinor"
                      name="Portfolio value"
                      stroke="#3e7356"
                    />
                    <Line
                      dataKey="principalMinor"
                      name="Principal"
                      stroke="#9b7955"
                      strokeDasharray="5 3"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Value</th>
                    <th>Principal</th>
                    <th>Gain / loss</th>
                    <th>Correction</th>
                  </tr>
                </thead>
                <tbody>
                  {history.toReversed().map((row) => (
                    <tr key={row.snapshotId}>
                      <td>{row.valuedAt.slice(0, 16).replace("T", " ")}</td>
                      <td>{money(row.valueMinor, c)}</td>
                      <td>{money(row.principalMinor, c)}</td>
                      <td>{money(row.gainMinor, c)}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setEditing(row.snapshotId)}
                        >
                          Edit
                        </button>{" "}
                        <button
                          type="button"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (
                              confirm(
                                "Delete this recorded valuation? Ledger transactions will not change.",
                              )
                            )
                              remove.mutate(row.snapshotId);
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">
              No market values recorded. This account currently falls back to
              its ledger book value.
            </p>
          )}
          <p className="muted">
            Gain/loss is portfolio value minus net contributed principal. It is
            not tax cost basis or broker performance.
          </p>
          <h3>Contribution and withdrawal history</h3>
          {contributions.length ? (
            <ul className="compact-list">
              {contributions.toReversed().map((row) => (
                <li key={row.id}>
                  <span>
                    {row.description}
                    <small>{row.date.slice(0, 10)}</small>
                  </span>
                  <strong
                    className={row.amountMinor < 0 ? "negative" : "positive"}
                  >
                    {row.amountMinor > 0 ? "+" : ""}
                    {money(row.amountMinor, c)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No external investment transfers recorded.</p>
          )}
        </section>
      ) : null}
    </Page>
  );
}
