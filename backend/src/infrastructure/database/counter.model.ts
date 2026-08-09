import { Schema, model, type ClientSession } from 'mongoose';

/**
 * Monotonic sequences, one document per counter.
 *
 * WHY THIS EXISTS: receipt numbers must be unique, gapless-looking and
 * predictable, and `collection.countDocuments() + 1` delivers none of that. Two
 * secretaries recording a payment in the same second both read the same count
 * and mint the same number; a cancelled receipt lowers the count and the next
 * one re-uses a number that is already printed and in a parent's hands.
 *
 * A single atomic `findOneAndUpdate({ $inc })` is the fix: MongoDB serializes
 * the update on one document, so every caller gets a distinct value even under
 * concurrency, and the sequence never moves backwards.
 *
 * See backend/AGENTS.md §20 — this is the strategy that file prescribes.
 */
export interface CounterAttributes {
  /** Namespaced key, e.g. `receipt:<clinicId>:2026`. */
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterAttributes>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'counters', versionKey: false, strict: 'throw' },
);

export const CounterModel = model<CounterAttributes>('Counter', counterSchema);

/**
 * Reserves and returns the next value for `key`.
 *
 * `upsert` creates the counter on first use, and `returnDocument: 'after'`
 * hands back the value this caller owns — nobody else can be given it.
 */
export async function nextSequenceValue(key: string, session?: ClientSession): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, ...(session ? { session } : {}) },
  )
    .lean<CounterAttributes>()
    .exec();

  return counter.seq;
}
