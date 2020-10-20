// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SIMULATE_TARGETS } from "../extension/simulate";

export class SimulateHelper {
    public static isSimulateTarget(target: string) {
        return SIMULATE_TARGETS.indexOf(target) > -1;
    }
}
