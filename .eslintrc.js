module.exports = {
    ignorePatterns: [
        "**/*.d.ts",
        "**/*.js",
    ],
    parser: "@typescript-eslint/parser",
    extends: [
        "plugin:@typescript-eslint/recommended"
    ],
    parserOptions: {
        ecmaVersion: 2018, // Allows for the parsing of modern ECMAScript features
        sourceType: "module", // Allows for the use of imports
    },
    plugins: [
        "header"
    ],
    rules: {
        "semi": "off",
        "@typescript-eslint/semi": ["error"],
        "@typescript-eslint/quotes": ["error", "double"],
        "@typescript-eslint/no-use-before-define": "warn",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/interface-name-prefix": "off",
        "@typescript-eslint/prefer-namespace-keyword": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/consistent-type-assertions": "off",
        "@typescript-eslint/no-empty-function": "warn",
        "@typescript-eslint/no-empty-interface": "warn",
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/triple-slash-reference": "off",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/member-delimiter-style": ["error", {
            multiline: {
                delimiter: 'comma',
                requireLast: true,
            },
            singleline: {
                delimiter: 'comma',
                requireLast: false,
            },
            overrides: {
                interface: {
                    multiline: {
                        delimiter: "semi",
                        requireLast: true
                    }
                }
            }
        }],
        "eol-last": "error",
        "prefer-const": "off",
        "no-trailing-spaces": "error",
        "header/header": [
            "error",
            "line",
            [" Copyright (c) Microsoft Corporation. All rights reserved.", " Licensed under the MIT license. See LICENSE file in the project root for details."],
        ],
        // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
        // e.g. "@typescript-eslint/explicit-function-return-type": "off",
    },
};
