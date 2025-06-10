/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export enum PartitionType {
  APP = 0x00,
  DATA = 0x01,
}

export enum AppPartitionSubType {
  FACTORY = 0x00,
  OTA_0 = 0x10,
  OTA_1 = 0x11,
  OTA_2 = 0x12,
  OTA_3 = 0x13,
  OTA_4 = 0x14,
  OTA_5 = 0x15,
  OTA_6 = 0x16,
  OTA_7 = 0x17,
  OTA_8 = 0x18,
  OTA_9 = 0x19,
  OTA_10 = 0x1a,
  OTA_11 = 0x1b,
  OTA_12 = 0x1c,
  OTA_13 = 0x1d,
  OTA_14 = 0x1e,
  OTA_15 = 0x1f,
  TEST = 0x20,
}

export enum DataPartitionSubType {
  OTA = 0x00,
  PHY = 0x01,
  NVS = 0x02,
  NVS_KEYS = 0x04,
  SPIFFS = 0x82,
}

export interface PartitionFlags {
  encrypted: boolean;
  readonly: boolean;
}

export interface PartitionDefinition {
  name: string;
  type: PartitionType;
  subType: AppPartitionSubType | DataPartitionSubType;
  offset?: number;
  size: number;
  flags?: Partial<PartitionFlags>;
}
