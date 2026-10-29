
"""
V4 Unified Field Theory — Unified Consistency Checker
Version 1.1

Install:
    python -m pip install sympy

Run:
    python v4_consistency.py
    python v4_consistency.py --self-test
    python v4_consistency.py --show-equations
    python v4_consistency.py --connect-all

The checker imports existing modules and calls their actual
self-tests. Missing modules and failed checks are reported
separately.

This is a consistency orchestrator, not proof that V4 is a
complete or experimentally verified physical theory.
"""

import argparse
import importlib.util
import sys
from pathlib import Path


# ============================================================
# 1. CANONICAL V4 MASTER EQUATION — PRESERVED
# ============================================================

V4_MASTER_EQUATION = r"""
Z = integral D(Fields) exp(i S_V4)

S_V4 = integral d^4x sqrt(-g) [
    R
    - F_mu_nu F^mu_nu
    - G_mu_nu G^mu_nu
    - W_mu_nu W^mu_nu
    + sum_i psi_bar_i D psi_i
    + (D_mu H)^dagger D^mu H
    - V(H)
    - lambda_ij psi_bar_i H psi_j
]
"""


# ============================================================
# 2. EXPECTED MODULES AND THEIR TEST INTERFACES
# ============================================================

# Each tuple contains:
# filename, module name, test setup, test invocation.
#
# setup:
#   None         -> no setup required
#   "build"      -> module.build_model()
#   "gravity"    -> module.derive_equations()
#
# invocation:
#   "plain"      -> self_test()
#   "model"      -> self_test(build_model())
#   "gravity"    -> self_test(derive_equations())

SECTOR_MODULES = [
    ("v4_fields.py", "v4_fields", None, "plain"),
    ("v4_matter.py", "v4_matter", None, "plain"),
    ("v4_fermion_sector.py", "v4_fermion_sector", None, "plain"),
    ("v4_unified_action.py", "v4_unified_action", None, "plain"),
    ("v4_variational.py", "v4_variational", "build", "model"),
    ("v4_gravity_sector.py", "v4_gravity_sector", "gravity", "gravity"),
    ("v4_electroweak_higgs.py", "v4_electroweak_higgs", "build", "model"),
    ("v4_coupled_matter.py", "v4_coupled_matter", None, "plain"),
]


# ============================================================
# 3. LOAD MODULES SAFELY
# ============================================================

def load_module(filename, module_name):
    """
    Load a local V4 module by its exact filename.

    Returns (module, None) on success, or (None, error_message)
    on failure.
    """
    path = Path(__file__).resolve().parent / filename

    if not path.is_file():
        return None, f"Missing file: {filename}"

    try:
        spec = importlib.util.spec_from_file_location(
            module_name, path
        )

        if spec is None or spec.loader is None:
            return None, f"Could not create import loader for {filename}"

        module = importlib.util.module_from_spec(spec)

        # Required for normal module initialization.
        sys.modules[module_name] = module
        spec.loader.exec_module(module)

        return module, None

    except Exception as exc:
        sys.modules.pop(module_name, None)
        return None, f"{type(exc).__name__}: {exc}"


# ============================================================
# 4. RUN EACH SECTOR'S REAL SELF-TEST
# ============================================================

def run_sector_test(filename, module_name, setup, invocation):
    module, error = load_module(filename, module_name)

    if error:
        if error.startswith("Missing file:"):
            return "MISSING", error

        return "FAIL", error

    test_function = getattr(module, "self_test", None)

    if not callable(test_function):
        return "FAIL", "Module has no callable self_test() function"

    try:
        if invocation == "plain":
            test_function()

        elif invocation == "model":
            builder = getattr(module, "build_model", None)

            if not callable(builder):
                return "FAIL", "Expected build_model() was not found"

            model = builder()
            test_function(model)

        elif invocation == "gravity":
            builder = getattr(module, "derive_equations", None)

            if not callable(builder):
                return "FAIL", "Expected derive_equations() was not found"

            equations = builder()
            test_function(equations)

        else:
            return "FAIL", f"Unknown test invocation: {invocation}"

        return "PASS", "Self-test completed without an exception"

    except Exception as exc:
        return "FAIL", f"{type(exc).__name__}: {exc}"


def run_all_sector_tests():
    print("\nSECTOR SELF-TESTS")
    print("=" * 72)

    results = {}

    for filename, module_name, setup, invocation in SECTOR_MODULES:
        print(f"\n[{module_name}]")

        status, detail = run_sector_test(
            filename,
            module_name,
            setup,
            invocation,
        )

        results[module_name] = {
            "status": status,
            "detail": detail,
        }

        print(f"Status: {status}")
        print(detail)

    return results


# ============================================================
# 5. OPTIONAL COUPLED-MATTER / HIGGS CONNECTION
# ============================================================

def run_combined_connection():
    """
    Ask v4_coupled_matter.py to assemble the expressions from
    v4_electroweak_higgs.py.

    This checks that the modules can connect and return arrays
    of the expected dimensions. It does not independently prove
    that every coupled equation is physically correct.
    """
    print("\nCOMBINED MATTER–HIGGS CONNECTION")
    print("=" * 72)

    matter, error = load_module(
        "v4_coupled_matter.py",
        "v4_coupled_matter",
    )

    if error:
        print(f"FAIL: {error}")
        return False

    connect = getattr(
        matter,
        "connect_to_electroweak_higgs",
        None,
    )

    if not callable(connect):
        print("FAIL: connection function is missing")
        return False

    try:
        combined = connect()

        expected_lengths = {
            "J_B_total": 4,
            "J_W_total": 3,
            "gauge_residual_B": 4,
            "gauge_residual_W": 3,
            "higgs_residuals": 4,
        }

        for key, expected in expected_lengths.items():
            if key not in combined:
                raise ValueError(f"Missing result: {key}")

            actual = len(combined[key])

            if actual != expected:
                raise ValueError(
                    f"{key}: expected outer size {expected}, "
                    f"received {actual}"
                )

        for name in ("J_W_total", "gauge_residual_W"):
            if any(len(row) != 4 for row in combined[name]):
                raise ValueError(
                    f"{name}: each gauge component must "
                    "contain four spacetime entries"
                )

        print("Connection: PASS")
        print("U(1) current components: 4")
        print("SU(2) current components: 3 x 4")
        print("Higgs residual components: 4")
        print(
            "Note: dimensional wiring checks passed; "
            "full equation equivalence is not established."
        )

        return True

    except Exception as exc:
        print(f"Connection: FAIL")
        print(f"{type(exc).__name__}: {exc}")
        return False


# ============================================================
# 6. SUMMARY
# ============================================================

def print_summary(results, connection_requested=False,
                  connection_passed=None):
    counts = {
        "PASS": 0,
        "FAIL": 0,
        "MISSING": 0,
    }

    for item in results.values():
        counts[item["status"]] += 1

    print("\nV4 CONSISTENCY SUMMARY")
    print("=" * 72)

    print(f"Sector checks passed:  {counts['PASS']}")
    print(f"Sector checks failed:  {counts['FAIL']}")
    print(f"Sector files missing:  {counts['MISSING']}")

    if connection_requested:
        print(
            "Combined connection:  "
            + ("PASS" if connection_passed else "FAIL")
        )

    if counts["FAIL"] > 0:
        print("\nRESULT: SOME CHECKS FAILED")
        print("Resolve each reported error before treating this")
        print("combination of sectors as consistent.")

    elif counts["MISSING"] > 0:
        print("\nRESULT: INCOMPLETE")
        print("Create the missing modules and run the checker again.")

    elif connection_requested and not connection_passed:
        print("\nRESULT: CONNECTION FAILED")

    else:
        print("\nRESULT: AVAILABLE CHECKS PASSED")
        print("This means the implemented checks passed, not that")
        print("V4 is proven to describe nature.")

    print("\nImportant limitations:")
    print("- The original V4 equation remains the canonical starting point.")
    print("- Gauge-field identities in the original equation remain unspecified.")
    print("- The gravitational test is spatially flat FLRW with a scalar.")
    print("- The checker does not yet derive the complete arbitrary-spacetime")
    print("  field equations from one fully specified master action.")


# ============================================================
# 7. REPORT THE MASTER EQUATION AND RUN
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="V4 Unified Field Theory consistency checker"
    )

    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run the available sector self-tests.",
    )

    parser.add_argument(
        "--show-equations",
        action="store_true",
        help="Print the canonical V4 master equation.",
    )

    parser.add_argument(
        "--connect-all",
        action="store_true",
        help="Also assemble the matter-Higgs-gauge connection.",
    )

    args = parser.parse_args()

    print("V4 UNIFIED FIELD THEORY")
    print("Consistency Checker — Version 1.1")
    print("=" * 72)

    if args.show_equations:
        print("\nCANONICAL V4 MASTER EQUATION")
        print(V4_MASTER_EQUATION)

    # Run the tests by default. --self-test is retained as an
    # explicit command-line option for ease of use.
    results = run_all_sector_tests()

    connection_passed = None

    if args.connect_all:
        connection_passed = run_combined_connection()

    print_summary(
        results,
        connection_requested=args.connect_all,
        connection_passed=connection_passed,
    )

    failed = any(
        item["status"] == "FAIL"
        for item in results.values()
    )

    missing = any(
        item["status"] == "MISSING"
        for item in results.values()
    )

    connection_failed = (
        args.connect_all and not connection_passed
    )

    if failed or missing or connection_failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
