class testClass {
    private value: number;
    constructor(val: number) {
        this.value = val;
    }

    public printValue(): void {
        console.info("Debugging typescript: " + this.value);
    }
}

function typeScript(): void {
    let obj = new testClass(42);
    obj.printValue();
}
