/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { NVSPage } from "./nvs-page";
import { NVSSettings } from "./nvs-settings";

export class NVSPartition implements Partition {
  static entries: HTMLInputElement[] = [];
  private namespaces: string[] = [];
  private pages: NVSPage[] = [];

  constructor(
    public readonly offset: number,
    public readonly filename: string,
    public size: number = 0x3000,
  ) {
    this.newPage();
  }

  private newPage(): NVSPage {
    this.pages.map((page: NVSPage) => {
      page.setPageState("FULL");
    });
    const index = this.pages.length;
    const nvsPage = new NVSPage(index, NVSSettings.NVS_VERSION);
    this.pages.push(nvsPage);
    return nvsPage;
  }

  private getLastPage(): NVSPage {
    const lastPageIndex = this.pages.length - 1;
    return this.pages[lastPageIndex];
  }

  private getNameSpaceIndex(namespace: string): number {
    for (let i = 0; i < this.namespaces.length; i++) {
      if (namespace === this.namespaces[i]) {
        return i + 1;
      }
    }
    // Add as new namespace if above didn't return.
    this.namespaces.push(namespace);
    const index = this.namespaces.length;
    const index = this.namespaces.length;
    try {
      const page = this.getLastPage();
      // Namespace definitions are always stored in namespace 0.
      // The key is the namespace name, and the value is its newly assigned index.
      page.writeEntry(namespace, index, 0); // Corrected: Always use namespace 0
    } catch (error) {
      // TODO: Add proper error handling, throw page full error.
      console.log(error);
      const page = this.newPage();
      page.writeEntry(namespace, index, index - 1);
    }
    return index;
  }

  /**
   * Dummy load method, implemented from other binaries that are downloaded.
   * @returns true
   */
  public async load(): Promise<boolean> {
    console.log("NVS Load");
    console.log(NVSPartition.entries);
    for (const input of NVSPartition.entries) {
      const namespace =
        input.getAttribute("namespace") || NVSSettings.DEFAULT_NAMESPACE;
      const key = input.id;
      const val = input.value;
      this.writeEntry(namespace, key, val);
    }
    return true;
  }

  /**
   * Retruns all page buffers.
   */
  public get binary(): Uint8Array {
    const buffer = new Uint8Array(this.size).fill(0xff);
    let i = 0;
    for (const page of this.pages) {
      const pageBuffer = page.getData();
      buffer.set(pageBuffer, i);
      i += pageBuffer.length;
    }
    return buffer;
  }

  /**
   * Write a key value pair to the NVS partition.
   * @param namespace Namespace to write entry to.
   * @param key Key, max 15 bytes. Keys are required to be unique.
   * @param data Value.
   */
  public writeEntry(namespace: string, key: string, data: string | number) {
    // Check if it fit within Partition size.
    const namespaceIndex = this.getNameSpaceIndex(namespace);
    try {
      const page = this.getLastPage();
      page.writeEntry(key, data, namespaceIndex);
    } catch (error) {
      console.log(error);
      console.log("Error page full?");
      // TODO: Add better error handling.
      const page = this.newPage();
      page.writeEntry(key, data, namespaceIndex);
    }
  }
}
