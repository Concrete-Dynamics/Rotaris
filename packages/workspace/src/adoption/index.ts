/**
 * Domain 22 — the requirements adoption assistant (REQ-ADOPT-001 to REQ-ADOPT-030, PD-TRACE-001): the detection pass,
 * the adapter composed from it and one model interpretation, the record in the workspace scope directory, and the
 * comparison on opening. Not a toolchain operation (REQ-TRACE-155): it produces the layout the toolchain reads.
 */
export * from './detect.js';
export * from './adapter.js';
export * from './record.js';
export * from './run.js';
