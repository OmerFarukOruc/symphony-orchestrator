import "../styles/audit.css";
import { createAuditPage } from "../views/audit-view";

export function render(): HTMLElement {
  return createAuditPage();
}
