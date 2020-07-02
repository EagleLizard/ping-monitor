# Ping Monitor

This tool runs several `ping` command subprocesses and keeps a log of the results. It provides tools to aggregate the results.

## Usage
To start the monitor:

```shell
$ npm start
```

To run the aggregate on collected logs:

```shell
$ npm run info
```

Aggregate totals are printed to stdout. Results aggregated by grouping on time stamp are written to `period_stat.txt`.
