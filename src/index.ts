import {
  JupyterFrontEnd, JupyterFrontEndPlugin
} from '@jupyterlab/application';


/**
 * Initialization data for the jupyterlab-cpustatus extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-cpustatus',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyterlab-cpustatus is activated!');
  }
};

export default extension;
