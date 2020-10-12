
import { PERIOD_TYPES } from '../constants';
import { ParsedLogLine } from '../parse-data/parse-ping';

export type AggregateValue = {
  [key: string]: number | string
};

export type GetStats<T> = () => Map<string, T>;

export interface PingAggregator<T> {
  aggregate: (parsedLogLine: ParsedLogLine) => void;
  getStats: GetStats<T>;
  periodType?: PERIOD_TYPES;
  groupByVal?: number;
}
