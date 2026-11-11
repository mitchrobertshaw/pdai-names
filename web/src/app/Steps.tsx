import { useEffect, useState } from "react";

import { CheckIcon, CrossIcon } from "../components/icons";
import type { Step } from "./flows";
import { txUrl } from "./network";

/** Counts down to a moment in this computer's time. */
function Countdown({ until }: { until: number }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((until - Date.now()) / 1000)));
  useEffect(() => {
    const timer = window.setInterval(() => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [until]);
  return <span className="progress__countdown">{left > 0 ? `${left}s` : "any moment"}</span>;
}

/** A purchase's steps as they happen: which are done, which is waiting on the wallet or the chain. */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="progress" aria-live="polite">
      {steps.map((step) => (
        <li key={step.key} className={`progress__item is-${step.status}`}>
          <span className="progress__icon" aria-hidden="true">
            {step.status === "done" ? (
              <CheckIcon size={14} />
            ) : step.status === "error" ? (
              <CrossIcon size={14} />
            ) : null}
          </span>
          <span className="progress__body">
            <span className="progress__title">
              {step.title}
              {step.status === "active" && step.until ? <Countdown until={step.until} /> : null}
            </span>
            {step.detail ? <span className="progress__detail">{step.detail}</span> : null}
            {step.tx ? (
              <a className="progress__tx" href={txUrl(step.tx.chain, step.tx.hash)} target="_blank" rel="noreferrer">
                View the transaction
              </a>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
