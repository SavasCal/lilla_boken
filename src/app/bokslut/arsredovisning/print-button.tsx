"use client";

export function PrintButton() {
  return <button type="button" className="btn btn-ghost shrink-0" onClick={() => window.print()}>Skriv ut / PDF</button>;
}
