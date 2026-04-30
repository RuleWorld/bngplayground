const str = "1e-3 + 2.5E4 + a_var * sin(b)";
console.log(/[^a-zA-Z0-9_.\s+\-*/()^,<>=!&|]/.test(str));
