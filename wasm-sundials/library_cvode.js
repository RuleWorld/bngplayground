mergeInto(LibraryManager.library, {
  js_f: function(t, y_ptr, ydot_ptr) {
    // Call the user-defined derivative callback attached to the Module
    if (Module.derivativeCallback) {
      Module.derivativeCallback(t, y_ptr, ydot_ptr);
    } else {
      console.error("CVODE: No derivative callback defined!");
    }
  },
  js_jac: function(t, y_ptr, fy_ptr, Jac_ptr, neq) {
    // Call the user-defined Jacobian callback attached to the Module
    // Jac is column-major dense matrix (neq x neq)
    if (Module.jacobianCallback) {
      Module.jacobianCallback(t, y_ptr, fy_ptr, Jac_ptr, neq);
    } else {
      console.error("CVODE: No jacobian callback defined!");
    }
  }
});
