import { repositoryContract } from "../contracts/repository";
import { d1Fixture } from "./fixture";
repositoryContract("D1", d1Fixture);

import { machineContract } from "../contracts/machine";
machineContract("D1", d1Fixture);
