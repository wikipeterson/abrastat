// The full multiple-choice letter alphabet, shared by everything that needs to know how many
// choices a question can have or turn a choice index into a letter (import validation, the
// answer-key builder, the flagged-answer review modal, print/scan row layout).
//
// 10 letters, not the 8 this used to be capped at — that 8 was never a physical constraint, just
// an unexamined array length. The printed column actually has room for 12 (COLUMN_WIDTH_IN minus
// the question-number label, divided by BUBBLE_PITCH_IN in geometry.ts), but 10 is the product
// call: past that, a question is realistically asking for a different format, not more letters.
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
