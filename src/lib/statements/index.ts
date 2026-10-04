import Papa from "papaparse";
import type { PendingFact, Txn } from "../store/types";

// CSV statement -> categorized transactions -> situation hints the user confirms.
// Rules only: raw descriptions never go to the model provider (privacy rule in
// PLAN 3.5). Unmatched rows stay "other".

type Rule = { category: string; re: RegExp; sign?: "in" | "out" };
const RULES: Rule[] = [
  { category: "government_benefit", re: /\b(CCB|CANADA CHILD|GST|HST CREDIT|CGEB|GROCER(Y|IES) (AND|&) ESS|TRILLIUM|OTB|CWB|WORKERS BEN|CANADA FED|PROV\/FED|ONTARIO CHILD)\b/i, sign: "in" },
  { category: "payroll", re: /\b(PAYROLL|PAY ?DEPOSIT|SALARY|DIRECT DEP)\b/i, sign: "in" },
  { category: "gig_income", re: /\b(UBER( ?(BV|PAYOUT|CANADA))?|DOORDASH|SKIP ?THE ?DISHES|INSTACART|LYFT|FIVERR|UPWORK|ETSY|SHOPIFY PAY|STRIPE)\b/i, sign: "in" },
  { category: "rent", re: /\b(RENT|LANDLORD|PROPERTY MGMT|PROPERTY MANAGEMENT|APARTMENTS?|TENANT|E-?TRANSFER.*RENT)\b/i, sign: "out" },
  { category: "tuition", re: /\b(UNIVERSITY|COLLEGE|TUITION|U OF T|UOFT|YORK U|TMU|SENECA|HUMBER|SHERIDAN|CONESTOGA|WATERLOO|GEORGE BROWN|CENTENNIAL)\b/i, sign: "out" },
  { category: "childcare", re: /\b(DAYCARE|DAY CARE|CHILD ?CARE|MONTESSORI|EARLY LEARNING|NURSERY|KIDS CLUB)\b/i, sign: "out" },
  { category: "student_loan", re: /\b(NSLSC|STUDENT LOAN|OSAP)\b/i },
  { category: "groceries", re: /\b(LOBLAW|NO FRILLS|FRESHCO|WALMART|COSTCO|METRO|SOBEYS|FOOD BASICS|FARM BOY|T&T|SUPERSTORE)\b/i, sign: "out" },
  { category: "transport", re: /\b(PRESTO|TTC|GO TRANSIT|MIWAY|BRAMPTON TRANSIT|GRT|PETRO|ESSO|SHELL)\b/i, sign: "out" },
  { category: "utilities", re: /\b(HYDRO|ENBRIDGE|ROGERS|BELL|TELUS|FIDO|KOODO|FREEDOM MOBILE|ALECTRA)\b/i, sign: "out" },
];

export function classify(description: string, amount: number): string {
  for (const r of RULES) {
    if (!r.re.test(description)) continue;
    if (r.sign === "in" && amount < 0) continue;
    if (r.sign === "out" && amount > 0) continue;
    return r.category;
  }
  return "other";
}

const DATE_COLS = ["date", "posted", "posting date", "transaction date", "posted date", "date posted"];
const DESC_COLS = ["description", "details", "memo", "payee", "name", "transaction", "narrative"];
const AMOUNT_COLS = ["amount", "cad$", "amount (cad)", "value"];
const DEBIT_COLS = ["debit", "withdrawal", "withdrawals", "money out"];
const CREDIT_COLS = ["credit", "deposit", "deposits", "money in"];

function pick(headers: string[], names: string[]): string | undefined {
  return headers.find((h) => names.includes(h.trim().toLowerCase()));
}
const money = (v: unknown) => {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
};
function isoDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/); // MM/DD/YYYY (most Canadian bank exports)
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function parseStatement(csv: string): { rows: Txn[]; skipped: number } {
  const parsed = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields ?? [];
  const dateCol = pick(headers, DATE_COLS);
  const descCol = pick(headers, DESC_COLS);
  const amtCol = pick(headers, AMOUNT_COLS);
  const debitCol = pick(headers, DEBIT_COLS);
  const creditCol = pick(headers, CREDIT_COLS);
  if (!dateCol || !descCol || (!amtCol && !debitCol && !creditCol)) {
    throw new Error("Could not find date, description and amount columns");
  }
  const rows: Txn[] = [];
  let skipped = 0;
  for (const r of parsed.data) {
    const postedOn = isoDate(r[dateCol] ?? "");
    const description = (r[descCol] ?? "").trim();
    const amount = amtCol ? money(r[amtCol]) : money(r[creditCol!]) - money(r[debitCol!]);
    if (!postedOn || !description) { skipped++; continue; }
    rows.push({ postedOn, description: description.slice(0, 200), amount, category: classify(description, amount) });
  }
  return { rows, skipped };
}

/** Derived hints only. These are staged as pending facts for the user to confirm. */
export function situationHints(rows: Txn[]): { hints: { code: string; count: number; total: number }[]; candidates: PendingFact[] } {
  const by = (c: string) => rows.filter((r) => r.category === c);
  const sum = (rs: Txn[]) => Math.round(rs.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const months = new Set(rows.map((r) => r.postedOn.slice(0, 7))).size || 1;
  const hints: { code: string; count: number; total: number }[] = [];
  const candidates: PendingFact[] = [];

  const rent = by("rent");
  if (rent.length >= 2) {
    hints.push({ code: "rent_payments_detected", count: rent.length, total: sum(rent) });
    candidates.push({ key: "housing", value: "rent", source: "statement", confidence: 0.8 });
    candidates.push({ key: "annualRent", value: Math.round((Math.abs(sum(rent)) / months) * 12), source: "statement", confidence: 0.6 });
  }
  const gig = by("gig_income");
  if (gig.length >= 2) {
    hints.push({ code: "gig_income_detected", count: gig.length, total: sum(gig) });
    candidates.push({ key: "selfEmployed", value: true, source: "statement", confidence: 0.7 });
  }
  const tuition = by("tuition");
  if (tuition.length >= 1) {
    hints.push({ code: "tuition_payment_detected", count: tuition.length, total: sum(tuition) });
    candidates.push({ key: "tuitionPaidThisYear", value: true, source: "statement", confidence: 0.7 });
  }
  const care = by("childcare");
  if (care.length >= 1) {
    hints.push({ code: "childcare_payments_detected", count: care.length, total: sum(care) });
    candidates.push({ key: "paidChildcareThisYear", value: true, source: "statement", confidence: 0.7 });
  }
  const loan = by("student_loan");
  if (loan.length >= 1) hints.push({ code: "student_loan_payments_detected", count: loan.length, total: sum(loan) });
  const pay = by("payroll");
  if (pay.length >= 1) {
    hints.push({ code: "payroll_detected", count: pay.length, total: sum(pay) });
    candidates.push({ key: "hasEmploymentIncome", value: true, source: "statement", confidence: 0.8 });
  }
  const gov = by("government_benefit");
  if (gov.length >= 1) hints.push({ code: "government_benefits_detected", count: gov.length, total: sum(gov) });
  return { hints, candidates };
}
