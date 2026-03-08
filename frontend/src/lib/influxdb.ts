import { InfluxDB } from "@influxdata/influxdb-client";

const url = process.env.INFLUXDB_URL || "http://influxdb:8086";
const token = process.env.INFLUXDB_TOKEN || "";
const org = process.env.INFLUXDB_ORG || "crypto-analytics";
const bucket = process.env.INFLUXDB_BUCKET || "crypto";

const influxDB = new InfluxDB({ url, token });
const queryApi = influxDB.getQueryApi(org);

export { queryApi, bucket };

export interface OHLCRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
}

export async function queryInflux<T>(fluxQuery: string): Promise<T[]> {
  const results: T[] = [];
  return new Promise((resolve, reject) => {
    queryApi.queryRows(fluxQuery, {
      next(row, tableMeta) {
        results.push(tableMeta.toObject(row) as T);
      },
      error(error) {
        reject(error);
      },
      complete() {
        resolve(results);
      },
    });
  });
}
