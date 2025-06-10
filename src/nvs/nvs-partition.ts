/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Partition } from "../partition/partition";
import { NVSPage } from "./nvs-page";
import { NVSSettings } from "./nvs-settings";

export class NVSPartition implements Partition {
  private namespaces: string[] = [];
  private pages: NVSPage[] = [];

  constructor(
    public readonly offset: number,
    public readonly filename: string,
    public size: number = 0x3000,
  ) {
    // Namespace at index 0 is reserved. We add a placeholder.
    this.namespaces.push("RESERVED_NS_0");
    this.newPage();
  }

  private newPage(): NVSPage {
    const lastPage = this.getLastPage();
    if (lastPage) {
      lastPage.setPageState("FULL");
    }
    const index = this.pages.length;
    const nvsPage = new NVSPage(index, NVSSettings.NVS_VERSION);
    this.pages.push(nvsPage);
    return nvsPage;
  }

  private getLastPage(): NVSPage | null {
    if (this.pages.length === 0) {
      return null;
    }
    return this.pages[this.pages.length - 1];
  }

  private getNameSpaceIndex(namespace: string): number {
    const existingIndex = this.namespaces.indexOf(namespace);
    if (existingIndex !== -1) {
      return existingIndex;
    }

    // Add as new namespace.
    if (this.namespaces.length >= 254) {
      throw new Error("Maximum number of namespaces (254) reached.");
    }
    const newIndex = this.namespaces.length;
    this.namespaces.push(namespace);

    // FIX: Namespace definitions are key-value pairs stored in namespace 0.
    // The key is the namespace name (e.g., "wifi") and the value is its index (e.g., 1).
    try {
      this.write(namespace, newIndex, 0); // Write to namespace 0
    } catch (e) {
      // This logic will be hit if writing the namespace entry itself fills the page.
      console.log("Page is full, creating new", e);
      this.newPage();
      this.write(namespace, newIndex, 0);
    }
    return newIndex;
  }

  // REFACTOR: Decouple from UI. Accept a generic array of data.
  public async load(): Promise<boolean> {
    return true;
  }

  public get binary(): Uint8Array {
    const buffer = new Uint8Array(this.size).fill(0xff);
    let offset = 0;
    for (const page of this.pages) {
      const pageBuffer = page.getData();
      buffer.set(pageBuffer, offset);
      offset += pageBuffer.length;
    }
    return buffer;
  }

  public writeEntry(namespace: string, key: string, data: string | number) {
    const namespaceIndex = this.getNameSpaceIndex(namespace);
    this.write(key, data, namespaceIndex);
  }

  // Private write helper to avoid recursive loop in namespace creation
  private write(key: string, data: string | number, namespaceIndex: number) {
    try {
      const page = this.getLastPage();
      if (!page) throw new Error("No active page available.");
      page.writeEntry(key, data, namespaceIndex);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Entry doesn't fit")
      ) {
        // If the current page is full, create a new one and retry.
        const page = this.newPage();
        page.writeEntry(key, data, namespaceIndex);
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  }
}
