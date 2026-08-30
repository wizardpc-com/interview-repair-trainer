import scenarioData from "../../protocols/scenarios/science-engineering-project-deep-dive.json";
import { parseScenarioPack } from "../domain/interview/scenario";

export const phaseOneScenario = parseScenarioPack(scenarioData);
