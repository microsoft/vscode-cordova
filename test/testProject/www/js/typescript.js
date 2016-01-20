var testClass = (function () {
    function testClass(val) {
        this.value = val;
    }
    testClass.prototype.printValue = function () {
        console.info("Debugging typescript: " + this.value);
    };
    return testClass;
})();
function typeScript() {
    var obj = new testClass(42);
    obj.printValue();
}
//# sourceMappingURL=typescript.js.map