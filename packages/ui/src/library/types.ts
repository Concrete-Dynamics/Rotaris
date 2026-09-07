/** REQ-LIBRARY-104: ONE query filters all three tabs; the shell owns it and hands it down. */
export interface LibraryTabProps {
  readonly query: string;      // already case-folded by the shell
  readonly revision: number;   // bumped on every library change (REQ-LIBRARY-105); a tab re-reads when it moves
}
