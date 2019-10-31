// Adapted from: https://github.com/jupyterlab/jupyterlab/blob/master/packages/statusbar/src/defaults/memoryUsage.tsx
// That code is copyright (c) Jupyter Development Team.
// That code is distributed under the terms of the Modified BSD License.
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';

import {
  IStatusBar,
  TextItem,
} from '@jupyterlab/statusbar';

import {
  URLExt,
  Poll,
} from '@jupyterlab/coreutils';

import {
  VDomModel,
  VDomRenderer,
} from '@jupyterlab/apputils';

import {
  ServerConnection,
} from '@jupyterlab/services';

import React from 'react';

/**
 * A VDomRenderer for showing processor usage by a kernel.
 */
class ProcessorUsage extends VDomRenderer<ProcessorUsage.Model> {
  /**
   * Construct a new processor usage status item.
   */
  constructor() {
    super();
    this.model = new ProcessorUsage.Model({ refreshRate: 5000 });
  }

  /**
   * Render the processor usage status item.
   */
  render() {
    if (!this.model) {
      return null;
    }
    let text: string;
    if (this.model.processorLimit === null) {
      text = `CPU: ${this.model.currentProcessor}%, # of CPUs: ${this.model.processorCount}`;
    }
    else {
      text = `CPU: ${this.model.currentProcessor}% / ${this.model.processorLimit}%, # of CPUs: ${this.model.processorCount}`;
    }
    return <TextItem title="Current processor usage" source={text} />;
  }
}

/**
 * A namespace for ProcessorUsage statics.
 */
namespace ProcessorUsage {
  /**
   * A VDomModel for the processor usage status item.
   */
  export class Model extends VDomModel {
    /**
     * Construct a new processor usage model.
     *
     * @param options: the options for creating the model.
     */
    constructor(options: Model.IOptions) {
      super();
      this._poll = new Poll<Private.IMetricRequestResult | null>({
        factory: () => Private.factory(),
        frequency: {
          interval: options.refreshRate,
          backoff: true,
        },
        name: '@jupyterlab/statusbar:ProcessorUsage#metrics'
      });
      this._poll.ticked.connect(poll => {
        const { payload, phase } = poll.state;
        if (phase === 'resolved') {
          this._updateMetricsValues(payload);
          return;
        }
        if (phase === 'rejected') {
          const oldMetricsAvailable = this._metricsAvailable;
          this._metricsAvailable = false;
          this._currentProcessor = 0;
          this._processorLimit = null;

          if (oldMetricsAvailable) {
            this.stateChanged.emit();
          }
          return;
        }
      });
    }

    /**
     * Whether the metrics server extension is available.
     */
    get metricsAvailable(): boolean {
      return this._metricsAvailable;
    }

    /**
     * The current processor usage.
     */
    get currentProcessor(): number {
      return this._currentProcessor;
    }

    /**
     * The number of processors as reported by psutil
     */
    get processorCount(): number {
      return this._processorCount;
    }

    /**
     * The current processor limit, or null if not specified.
     */
    get processorLimit(): number | null {
      return this._processorLimit;
    }

    /**
     * Dispose of the memory usage model.
     */
    dispose(): void {
      super.dispose();
      this._poll.dispose();
    }

    /**
     * Given the results of the metrics request, update model values.
     */
    private _updateMetricsValues(
      value: Private.IMetricRequestResult | null
    ): void {
      const oldMetricsAvailable = this._metricsAvailable;
      const oldCurrentProcessor = this._currentProcessor;
      const oldProcessorLimit = this._processorLimit;

      if (value === null) {
        this._metricsAvailable = false;
        this._currentProcessor = 0;
        this._processorLimit = null;
      }
      else {
        const cpuPercent = value.cpu_percent;
        const cpuCount = value.cpu_count;
        const processorLimit = value.limits.cpu
          ? value.limits.cpu.cpu
          : null;
        this._metricsAvailable = true;
        this._currentProcessor = cpuPercent;
        this._processorLimit = processorLimit;
        this._processorCount = cpuCount;
      }

      if (
        this._currentProcessor !== oldCurrentProcessor ||
        this._processorLimit !== oldProcessorLimit ||
        this._metricsAvailable !== oldMetricsAvailable
      ) {
        this.stateChanged.emit(void 0);
      }
    }

    private _currentProcessor: number = 0;
    private _processorCount: number = 1;
    private _processorLimit: number | null = null;
    private _metricsAvailable: boolean = false;
    private _poll: Poll<Private.IMetricRequestResult>;
  }

  /**
   * A namespace for Model statics.
   */
  export namespace Model {
    /**
     * Options for creating a ProcessorUsage model.
     */
    export interface IOptions {
      /**
       * The refresh rate (in ms) for querying the server.
       */
      refreshRate: number;
    }
  }
}

/**
 * A namespace for module private statics.
 */
namespace Private {
  /**
   * Settings for making requests to the server.
   */
  const SERVER_CONNECTION_SETTINGS = ServerConnection.makeSettings();

  /**
   * The url endpoint for making requests to the server.
   */
  const METRIC_URL = URLExt.join(SERVER_CONNECTION_SETTINGS.baseUrl, 'metrics');

  /**
   * The shape of a response from the metrics server extension.
   */
  export interface IMetricRequestResult {
    rss: number;
    limits: {
      memory?: {
        rss: number;
        warn?: number;
      };
      cpu?: {
        cpu: number;
        warn?: number;
      }
    };
    cpu_percent?: number;
    cpu_count?: number;
  }

  /**
   * Make a request to the backend.
   */
  export async function factory(): Promise<IMetricRequestResult | null> {
    const request = ServerConnection.makeRequest(
      METRIC_URL,
      {},
      SERVER_CONNECTION_SETTINGS
    );
    const response = await request;

    if (response.ok) {
      try {
        return await response.json();
      } catch (error) {
        throw error;
      }
    }

    return null;
  }
}

/**
 * A plugin providing processor usage statistics to the application.
 *
 * #### Notes
 * This plugin will not work unless the processor usage server extension
 * is installed.
 */
export const processorUsageItem: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/statusbar-extension:processor-usage-status',
  autoStart: true,
  requires: [IStatusBar],
  activate: (app: JupyterFrontEnd, statusBar: IStatusBar) => {
    console.log('JupyterLab extension jupyterlab-cpustatus is activated!');
    let item = new ProcessorUsage();

    statusBar.registerStatusItem(
      '@jupyterlab/statusbar-extension:processor-usage-status',
      {
        item,
        align: 'left',
        rank: 2,
        isActive: () => item.model!.metricsAvailable,
        activeStateChanged: item.model!.stateChanged
      }
    );
  }
};

export default processorUsageItem;
