// Get Unit returns a unit for annotation.
// It can include a unit_index parameter to get a specific unit.
// Otherwise the server will determine what the next unit is.

// get unit should also return the progress of the user (done, total, etc.).

// get unit should also return an encrypted state. This should contain the
// jobset and unit_id, and can optionally contain conditionals. This way conditionals
// can be tested on the edge. The encrypted state should include padding so
// that the size of the encrypted state does not show whether there are conditionals

// this encrypted state is sent back to the server when the user submits annotations.
// the server can then decrypt the state and check the conditionals, and also determine
// whether the user is allowed to submit annotations for this unit.
