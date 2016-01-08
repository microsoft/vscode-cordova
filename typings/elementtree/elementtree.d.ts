/**
 *******************************************************
 *                                                     *
 *   Copyright (C) Microsoft. All rights reserved.     *
 *                                                     *
 *******************************************************
 */

// Barebones typing for elementtree, added as-needed

declare module "elementtree" {
    export class ElementTree {
        constructor(xml: XMLElement);

        getroot(): XMLElement
        find(name: string): XMLElement;
        findall(name: string): XMLElement[];
    }

    export class XMLElement {
        attrib: { [key: string]: string };
        text: string;
        tag: string;
        _children: XMLElement[];
    }

    export function XML(data: string): XMLElement;
}
