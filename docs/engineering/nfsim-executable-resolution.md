# BioNetGen resolves NFsim/run_network from `$BNGPATH/bin`, not from PATH

## The trap

Putting `$BNGPATH/bin` on `PATH` does **not** make BioNetGen find NFsim.
`findExec` never consults `PATH`:

`bng2/Perl2/BNGModel.pm:2841`

```perl
sub findExec
{
    use Config;
    my $prog = shift @_;
    my $base = BNGpath( "bin", $prog );
    my $arch = $Config{myarchname};

    # First look for generic binary in BNGpath
    my $exec = $base;
    if ($arch =~ /MSWin32/) { $exec .= ".exe"; }
    if (-x $exec) { return $exec; }

    # Then look for OS-specific binary
    $exec = "${base}_${arch}";
    ...
    if (-x $exec) { return $exec; }
    else
    {
        print "findExec: $exec not found.\n";
        return '';
    }
}
```

It probes exactly two paths, both **inside `$BNGPATH/bin`**:

1. `$BNGPATH/bin/<prog>`
2. `$BNGPATH/bin/<prog>_$Config{myarchname}` (on macOS that is `NFsim_i386-darwin`)

If neither is an executable file it prints `findExec: ... not found.` and the caller
raises `ABORT: Could not find executable NFsim` (`Perl2/BNGAction.pm:911`).

Consequence: a plain `NFsim` sitting in a directory on `PATH` is invisible to
BioNetGen. Measured directly — with `NFsim` first on `PATH` but absent from
`$BNGPATH/bin`, five models still aborted with:

```
findExec: /.../bng2/bin/NFsim_i386-darwin not found.
ABORT: Could not find executable NFsim
```

The failure is *late*: those models had already written their `.net` and only
failed at the `simulate({method=>"nf"})` step, so the abort looks unrelated to
NFsim's absence unless you read the log.

## How it is supposed to be installed

The file must be **at `$BNGPATH/bin/NFsim`**. That is why CI is unaffected: it
copies `run_network` and `NFsim` into `$BNGPATH/bin`. The top-level
`bng2/Makefile` expresses the same intent:

```
GROUP_BINDIR = bin
NFSIM_BIN = NFsim
...
$(NFSIM_BIN):
	git submodule init; git submodule update
	mkdir -p $(NFSIM_DIR)/lib; cd $(NFSIM_DIR)/lib; cmake ..; make
	mkdir -p $(GROUP_BINDIR)
	cp $(NFSIM_DIR)/lib/$(NFSIM_BIN) $(GROUP_BINDIR)
```

Note the destination is `$(GROUP_BINDIR)`, i.e. `bin/` — never a PATH entry.
This is also why `export PATH=$BNGPATH/bin:$PATH` is not merely redundant but
actively misleading as an install step: it looks like it works.

## Never "simplify" this

Anybody who replaces the `bin/` copy with a PATH-based install, or who drops
`NFsim`/`run_network` from `$BNGPATH/bin` on the assumption that `PATH` is
searched, will silently reclassify every network-free model as
"BioNetGen cannot process this". The models still fail — just with a message
that names an environment gap rather than a model defect, which is exactly the
difference that a ratchet entry is supposed to preserve.

## Version pinning

`bng2/bin/NFsim` must match the version the Perl layer was written against.
`CHANGES.txt` for this checkout (`VERSION` = 2.9.3) shows 2.9.3 did **not**
bump NFsim, so 1.14.2 (from the 2.9.2 entry) is still correct. Binaries come
from the separate `nfsim` repo (RuleWorld/nfsim) — they are not vendored and
`.gitmodules` is empty, so `git submodule update` as the Makefile suggests is a
no-op in this tree. `bng2/Network3/` builds only `run_network` (its
`CMakeLists.txt` has a single `add_executable(run_network ...)`), so building
the checkout does **not** produce NFsim.