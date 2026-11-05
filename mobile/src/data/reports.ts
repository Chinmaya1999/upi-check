import { CATEGORIES, formatINR, summarizeRange, categoryBreakdown, type Transaction } from '@upi/core';
import { PERIOD_LABEL, periodRange, type Period } from './budgets';

const cat = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
const rs = (paise: number) => (paise / 100).toFixed(2);
const csv = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const fmtDay = (k: string) => new Date(`${k}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export interface Report { period: Period; from: string; to: string; title: string; fileBase: string; spent: number; received: number; net: number; count: number; rows: Transaction[]; top: { label: string; paise: number }[] }

export function buildReport(txns: Transaction[], period: Period, now: Date): Report {
  const { from, to } = periodRange(period, now);
  const sum = summarizeRange(txns, from, to);
  const rows = txns
    .filter((t) => t.dayKey >= from && t.dayKey <= to && t.status === 'confirmed' && t.kind !== 'reversal' && t.kind !== 'self_transfer')
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return {
    period, from, to, rows, spent: sum.expensePaise, received: sum.incomePaise + sum.refundPaise, net: sum.netPaise, count: sum.count,
    title: `${PERIOD_LABEL[period]} report · ${from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`}`,
    fileBase: `Paisa-${period}-report-${to}`,
    top: categoryBreakdown(txns, from, to).slice(0, 5).map((c) => ({ label: cat(c.categoryId), paise: c.paise })),
  };
}

/** Opens cleanly in Excel / Google Sheets. */
export function toCsv(r: Report): string {
  const head = [
    ['Paisa', r.title], ['Total spent (₹)', rs(r.spent)], ['Total received (₹)', rs(r.received)], ['Net (₹)', rs(r.net)], ['Transactions', r.count], [],
    ['Date', 'Time', 'Type', 'Amount (₹)', 'Merchant', 'Category', 'Paid via', 'Reference', 'Details'],
  ];
  const body = r.rows.map((t) => [
    t.dayKey, new Date(t.occurredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }),
    t.direction === 'debit' ? 'Debit' : 'Credit', rs(t.amountPaise), t.merchant, cat(t.categoryId), t.paymentApp, t.reference ?? '', t.narration,
  ]);
  return '﻿' + [...head, ...body].map((row) => row.map(csv).join(',')).join('\n');
}

/** Printable HTML — open in a browser and "Print → Save as PDF". */
export function toHtml(r: Report): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.title)}</title>
<style>body{font:14px system-ui;margin:24px;color:#101827}h1{font-size:20px}.k{display:flex;gap:12px;margin:16px 0}.k div{flex:1;padding:14px;border-radius:14px;background:#F5F7FA}.k b{display:block;font-size:20px;margin-top:4px}
table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #E4E8EF;text-align:left}.d{color:#E03131}.c{color:#0CA678}</style>
<h1>${esc(r.title)}</h1><div class="k"><div>Spent<b class="d">${formatINR(r.spent)}</b></div><div>Received<b class="c">${formatINR(r.received)}</b></div><div>Net<b>${formatINR(Math.abs(r.net))}${r.net < 0 ? ' deficit' : ''}</b></div></div>
<table><tr><th>Date</th><th>Merchant</th><th>Category</th><th style="text-align:right">Amount</th></tr>${r.rows.map((t) =>
  `<tr><td>${t.dayKey}</td><td>${esc(t.merchant)}</td><td>${esc(cat(t.categoryId))}</td><td style="text-align:right" class="${t.direction === 'debit' ? 'd' : 'c'}">${t.direction === 'debit' ? '−' : '+'}${formatINR(t.amountPaise)}</td></tr>`).join('')}</table>`;
}

export function toText(r: Report): string {
  return [`📊 ${r.title}`, '', `Spent: ${formatINR(r.spent)}`, `Received: ${formatINR(r.received)}`, `Net: ${r.net < 0 ? '−' : ''}${formatINR(Math.abs(r.net))}`, `Transactions: ${r.count}`,
    ...(r.top.length ? ['', 'Top categories:', ...r.top.map((c) => `• ${c.label}: ${formatINR(c.paise)}`)] : [])].join('\n');
}
