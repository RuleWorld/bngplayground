/**
 * The network-free classifier decides whether `generate:gdat` runs BNG2 at all.
 * Getting it wrong is CI-visible: a misclassified network-free model runs NFsim,
 * which writes a `.gdat` but never a `.net`, and the network-shape gate then
 * demands a ratchet entry for a fixture that should never have existed
 * (blbr, dolan2015, dolan_2015). Comments must not count as actions.
 */
import { describe, expect, it } from 'vitest';

import { isNetworkFreeModel } from '../scripts/generation/generate_no_ref_gdat';

describe('isNetworkFreeModel', () => {
	it('treats a commented-out generate_network above an nf simulate as network-free', () => {
		// Shape of Tutorials/NativeTutorials/BLBR/BLBR.bngl.
		const blbr = `
#generate_network({max_stoich=>{R=>5,L=>5}})
#simulate({method=>"ode",t_end=>10,n_steps=>1000})
simulate({method=>"nf",t_end=>10,n_steps=>1000,get_final_state=>1})
`;
		expect(isNetworkFreeModel(blbr)).toBe(true);
	});

	it('treats commented generate_network plus active simulate_nf runs as network-free', () => {
		// Shape of Published/Dolan2015/Dolan_2015.bngl.
		const dolan = `
# generate_network({overwrite=>1});
# simulate_ode({t_end=>5460,n_steps=>10,sparse=>1});
simulate_nf({suffix=>"nf_run1",t_end=>2400,n_steps=>2400});
simulate_nf({suffix=>"nf_run2",t_end=>2400,n_steps=>2400});
`;
		expect(isNetworkFreeModel(dolan)).toBe(true);
	});

	it('still refuses network-free status when generate_network is active', () => {
		const model = `
generate_network({overwrite=>1});
simulate({method=>"nf",t_end=>10,n_steps=>100});
`;
		expect(isNetworkFreeModel(model)).toBe(false);
	});

	it('is false for an ODE simulate with no network request at all', () => {
		const model = `
simulate({method=>"ode",t_end=>10,n_steps=>100});
`;
		expect(isNetworkFreeModel(model)).toBe(false);
	});

	it('is false when every simulate call is commented out', () => {
		// Shape of Tutorials/NativeTutorials/SIR/SIR.bngl: no active action means
		// the classifier cannot claim the author asked for a network-free run.
		const model = `
# simulate({method=>"nf",t_end=>10,n_steps=>100});
begin reaction rules
end
`;
		expect(isNetworkFreeModel(model)).toBe(false);
	});

	it('is false when the model declares no simulate actions', () => {
		expect(isNetworkFreeModel('begin model\nend\n')).toBe(false);
	});
});
