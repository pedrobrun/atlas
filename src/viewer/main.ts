// Entry point of the viewer bundle.
import { buildScene, fitView, frameFocus, introCamera, tick } from './scene.ts';
import { applyState } from './nav.ts';
import { wirePanels } from './panels.ts';
import { wirePicking } from './pick.ts';
import { wireChat } from './chat.ts';

wirePanels();
wirePicking();
wireChat();
fitView();
buildScene();
applyState(true);
frameFocus();
introCamera();
tick();
