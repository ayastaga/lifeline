import type { Program } from "./types";
import canada_training_credit from "./programs/canada_training_credit.json";
import ccb from "./programs/ccb.json";
import cdcp from "./programs/cdcp.json";
import child_care_deduction from "./programs/child_care_deduction.json";
import clb from "./programs/clb.json";
import cpp_self_employed from "./programs/cpp_self_employed.json";
import cwb from "./programs/cwb.json";
import ei_self_employed from "./programs/ei_self_employed.json";
import first_tax_return from "./programs/first_tax_return.json";
import gst_hst_credit from "./programs/gst_hst_credit.json";
import home_vehicle_expenses from "./programs/home_vehicle_expenses.json";
import hst_registration from "./programs/hst_registration.json";
import ocb from "./programs/ocb.json";
import osap from "./programs/osap.json";
import otb from "./programs/otb.json";
import resp_cesg from "./programs/resp_cesg.json";
import sin_credit_building from "./programs/sin_credit_building.json";
import student_loan_interest from "./programs/student_loan_interest.json";
import tax_instalments from "./programs/tax_instalments.json";
import tuition_credit from "./programs/tuition_credit.json";
import tfsa from "./programs/tfsa.json";
import fhsa from "./programs/fhsa.json";

// Static imports so programs bundle with the app (no fs at runtime).
// Order = display order in the plan.
export const PROGRAMS: Program[] = [
  gst_hst_credit, otb, cwb, ccb, ocb, resp_cesg, clb, tfsa, fhsa, child_care_deduction, cdcp,
  first_tax_return, sin_credit_building, tuition_credit, osap, canada_training_credit,
  student_loan_interest, hst_registration, cpp_self_employed, tax_instalments,
  home_vehicle_expenses, ei_self_employed,
] as Program[];

export function getProgram(id: string): Program | undefined {
  return PROGRAMS.find((p) => p.id === id);
}
