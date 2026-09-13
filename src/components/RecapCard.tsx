import { forwardRef } from "react";
import { categoryIcon } from "@/lib/categories";
import { Carrot } from "./ui/Carrot";
import { formatCents } from "@/lib/money";
import { monthLabel } from "@/lib/dates";
import { recapName, type Recap, type RecapStyle } from "@/lib/recap";
import "@fontsource/bricolage-grotesque/500.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "./RecapCard.css";

export type RecapCardProps = {
  recap: Recap;
  month: Date;
  current: boolean;
  style: RecapStyle;
  title: { title: string; caption: string };
  caption: boolean;
  amounts: boolean;
  name: string;
  currency: string;
};

export const RecapCard = forwardRef<HTMLElement, RecapCardProps>(
  function RecapCard(
    { recap, month, current, style, title, caption, amounts, name, currency },
    ref,
  ) {
    const leading = recap.categories[0];
    const Icon = categoryIcon(leading.id);
    const displayName = recapName(name);
    const trading = style === "trading";
    return (
      <article
        ref={ref}
        className={`recap-card recap-${style} ph-no-capture ph-mask`}
        aria-label={trading ? "Trading card" : "Monthly recap"}
      >
        <div className="recap-inner">
          <header className="recap-head">
            <span className="recap-brand">
              <Carrot className="text-lg" />
              bucksbuddy
            </span>
            <span className="recap-edition">{monthLabel(month)}</span>
          </header>
          {!trading && (
            <p className="recap-kicker">
              {displayName ? `${displayName}, your month was` : "My month was"}
            </p>
          )}
          <h2>{title.title}</h2>
          {trading ? (
            <>
              <div className="recap-art">
                <div className="recap-orbit" />
                <span className="recap-star" aria-hidden="true">
                  ✦
                </span>
                <div className="recap-badge">
                  <Icon size={28} aria-hidden="true" />
                  <span className="recap-percent">{leading.percent}%</span>
                  <strong>{leading.label}</strong>
                  <span className="recap-micro">of logged spending</span>
                </div>
                <span className="recap-star second" aria-hidden="true">
                  ✦
                </span>
              </div>
              <div className="recap-stats">
                <div>
                  <strong>
                    {amounts
                      ? formatCents(leading.cents, currency)
                      : recap.entries}
                  </strong>
                  <span>
                    {amounts ? `${leading.label} logged` : "Logged entries"}
                  </span>
                </div>
                <div>
                  <strong>{leading.entries}</strong>
                  <span>{leading.label} entries</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="recap-total">
                <span>{amounts ? "Total logged" : "Logged entries"}</span>
                <strong>
                  {amounts ? formatCents(recap.total, currency) : recap.entries}
                </strong>
              </div>
              <div className="recap-bar" aria-hidden="true">
                {recap.split.map((b) => (
                  <span key={b.id} style={{ flex: b.share }} />
                ))}
              </div>
              {recap.split.map((b) => {
                const BucketIcon = categoryIcon(b.id);
                return (
                  <div className="recap-row" key={b.id}>
                    <span>
                      <BucketIcon size={17} aria-hidden="true" />
                      {b.label}
                    </span>
                    <span>
                      {amounts && <>{formatCents(b.cents, currency)} · </>}
                      {b.percent}%
                    </span>
                  </div>
                );
              })}
            </>
          )}
          {caption && <p className="recap-quote">{title.caption}</p>}
          <footer className="recap-foot">
            <span>
              {trading
                ? displayName
                  ? `${displayName}'S COLLECTION`
                  : "MY COLLECTION"
                : "YOUR MONTH. YOUR PLOT TWIST."}
            </span>
            <span>bucksbuddy.com</span>
          </footer>
          {current && <p className="recap-progress">Month so far</p>}
        </div>
      </article>
    );
  },
);
