2025-05-24
Removed unnecessary .filter() allocation in hot loops over molecules in atomizer, using inline continue conditions instead to avoid intermediate array instantiation.
