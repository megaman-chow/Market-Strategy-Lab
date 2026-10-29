
"""
V4 Unified Field Theory — Fermion Sector
Version 0.5
====================================================

Install:
    python -m pip install sympy

Run:
    python v4_fermion_sector.py
    python v4_fermion_sector.py --self-test
    python v4_fermion_sector.py --show-equations

Purpose:
    - Preserve the original V4 master equation.
    - Define a proposed Standard Model-like fermion realization.
    - Represent the Yukawa interaction matrices.
    - Check hypercharge conservation.
    - Check the engineering dimensions of Yukawa terms.
    - Display formal fermion equations of motion.

Important:
    This is a proposed realization of the schematic V4
    fermion term. The original image does not uniquely specify
    the gauge representations or fermion content.

    This is a symbolic consistency scaffold, not a complete
    or experimentally validated unified field theory.
"""

import argparse
from fractions import Fraction

import sympy as sp


# ============================================================
# 1. PRESERVE THE ORIGINAL V4 MASTER EQUATION
# ============================================================

R, F2, G2, W2 = sp.symbols(
    "R F2 G2 W2", real=True
)

K_FERMION, K_HIGGS, V_HIGGS, YUKAWA = sp.symbols(
    "K_fermion K_Higgs V_Higgs Yukawa",
    real=True,
)

V4_ORIGINAL_LAGRANGIAN = (
    R
    - F2
    - G2
    - W2
    + K_FERMION
    + K_HIGGS
    - V_HIGGS
    - YUKAWA
)


# ============================================================
# 2. PROPOSED FERMION AND HIGGS REPRESENTATIONS
# ============================================================

# Representation notation:
# (SU(3)_C representation, SU(2)_L representation, Y)
#
# The hypercharge assignments below define a conventional
# Standard Model-like realization of the V4 matter sector.

REPRESENTATIONS = {
    "Q_L": ("3", "2", Fraction(1, 6)),
    "u_R": ("3", "1", Fraction(2, 3)),
    "d_R": ("3", "1", Fraction(-1, 3)),
    "L_L": ("1", "2", Fraction(-1, 2)),
    "e_R": ("1", "1", Fraction(-1, 1)),
    "H":   ("1", "2", Fraction(1, 2)),
}


def representation_report():
    """Print the assumed gauge representations."""

    print("\nProposed field representations")
    print("--------------------------------")

    print(
        f"{'Field':<8} {'SU(3)_C':<12} "
        f"{'SU(2)_L':<12} {'Hypercharge Y'}"
    )

    for field, (color, weak, hypercharge) in (
        REPRESENTATIONS.items()
    ):
        print(
            f"{field:<8} {color:<12} "
            f"{weak:<12} {hypercharge}"
        )


# ============================================================
# 3. YUKAWA COUPLING MATRICES
# ============================================================

# Each matrix acts in generation/flavor space.
#
# These are symbolic matrices; their numerical values are
# parameters to be established from physical measurements.

Y_u = sp.MatrixSymbol("Y_u", 3, 3)
Y_d = sp.MatrixSymbol("Y_d", 3, 3)
Y_e = sp.MatrixSymbol("Y_e", 3, 3)

YUKAWA_MATRICES = {
    "up-type quarks": Y_u,
    "down-type quarks": Y_d,
    "charged leptons": Y_e,
}


# ============================================================
# 4. ORIGINAL SCHEMATIC TERM AND PROPOSED EXPANSION
# ============================================================

ORIGINAL_YUKAWA_TERM = (
    "-lambda_ij * psi_bar_i * H * psi_j"
)

# Define:
#
#   H_tilde = i sigma_2 H*
#
# The gauge-compatible interaction terms are:
#
#   L_Y = -Qbar_L Y_d H d_R
#         -Qbar_L Y_u H_tilde u_R
#         -Lbar_L Y_e H e_R
#         + Hermitian conjugate.
#
# Color, weak-isospin and generation indices are suppressed.

YUKAWA_TERMS = {
    "down-type quarks": (
        "- Qbar_L Y_d H d_R + h.c."
    ),
    "up-type quarks": (
        "- Qbar_L Y_u H_tilde u_R + h.c."
    ),
    "charged leptons": (
        "- Lbar_L Y_e H e_R + h.c."
    ),
}


# ============================================================
# 5. HYPERCHARGE CONSERVATION
# ============================================================

def yukawa_hypercharge_checks():
    """
    A gauge-invariant interaction must have total hypercharge 0.

    Qbar_L H d_R:
        -Y(Q_L) + Y(H) + Y(d_R) = 0

    Qbar_L H_tilde u_R:
        -Y(Q_L) - Y(H) + Y(u_R) = 0

    Lbar_L H e_R:
        -Y(L_L) + Y(H) + Y(e_R) = 0
    """

    q = REPRESENTATIONS["Q_L"][2]
    u = REPRESENTATIONS["u_R"][2]
    d = REPRESENTATIONS["d_R"][2]
    l = REPRESENTATIONS["L_L"][2]
    e = REPRESENTATIONS["e_R"][2]
    h = REPRESENTATIONS["H"][2]

    results = {
        "down-type quarks": -q + h + d,
        "up-type quarks": -q - h + u,
        "charged leptons": -l + h + e,
    }

    return results


# ============================================================
# 6. ENGINEERING-DIMENSION CHECKS
# ============================================================

def yukawa_dimension_checks():
    """
    Natural units in four dimensions:

        [fermion field] = 3/2
        [scalar field]  = 1
        [Yukawa matrix] = 0

    Thus:
        [psi_bar H psi] = 3/2 + 1 + 3/2 = 4.
    """

    fermion_dimension = Fraction(3, 2)
    higgs_dimension = Fraction(1, 1)
    coupling_dimension = Fraction(0, 1)

    interaction_dimension = (
        fermion_dimension
        + higgs_dimension
        + fermion_dimension
        + coupling_dimension
    )

    return {
        "fermion field": fermion_dimension,
        "Higgs field": higgs_dimension,
        "Yukawa matrix": coupling_dimension,
        "Yukawa interaction": interaction_dimension,
    }


# ============================================================
# 7. FORMAL FERMION EQUATIONS OF MOTION
# ============================================================

# D_mu includes the appropriate gauge and spacetime connections.
# Gamma^mu are spacetime gamma matrices.
#
# These equations are displayed in compact notation.
# Their exact component realization requires the specified
# representations, metric, gamma matrices and field content.

FERMION_EQUATIONS = {
    "left-handed quark doublet Q_L": (
        "i gamma^mu D_mu Q_L "
        "- Y_d H d_R "
        "- Y_u H_tilde u_R = 0"
    ),

    "right-handed up quarks u_R": (
        "i gamma^mu D_mu u_R "
        "- Y_u^dagger H_tilde^dagger Q_L = 0"
    ),

    "right-handed down quarks d_R": (
        "i gamma^mu D_mu d_R "
        "- Y_d^dagger H^dagger Q_L = 0"
    ),

    "left-handed lepton doublet L_L": (
        "i gamma^mu D_mu L_L "
        "- Y_e H e_R = 0"
    ),

    "right-handed charged leptons e_R": (
        "i gamma^mu D_mu e_R "
        "- Y_e^dagger H^dagger L_L = 0"
    ),
}


# ============================================================
# 8. HIGGS-SOURCE RELATION
# ============================================================

HIGGS_SOURCE_RELATION = (
    "The Yukawa contribution to the Higgs equation is "
    "obtained by varying the complete Yukawa Lagrangian "
    "with respect to H^dagger, including its Hermitian "
    "conjugate. The result depends on the explicit gauge "
    "and flavor contractions."
)


# ============================================================
# 9. SELF-TESTS
# ============================================================

def self_test():
    # Test gauge-charge conservation for every Yukawa term.
    for name, total_charge in (
        yukawa_hypercharge_checks().items()
    ):
        assert total_charge == 0, (
            f"Hypercharge violation in {name}: "
            f"{total_charge}"
        )

    # Test dimension of the Yukawa interaction.
    dimensions = yukawa_dimension_checks()

    assert dimensions["Yukawa interaction"] == 4, (
        "Yukawa interaction must have mass dimension four."
    )

    # Test that all three flavor matrices are 3 x 3.
    for name, matrix in YUKAWA_MATRICES.items():
        assert matrix.shape == (3, 3), (
            f"Incorrect flavor matrix size for {name}"
        )

    print("V4 fermion-sector self-tests passed.")
    print("Hypercharge conservation: passed (3/3).")
    print("Yukawa dimension: passed.")
    print("Flavor-matrix dimensions: passed (3/3).")


# ============================================================
# 10. COMMAND-LINE INTERFACE
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="V4 Unified Field Theory — Fermion Sector"
    )

    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run gauge-charge and dimension tests.",
    )

    parser.add_argument(
        "--show-equations",
        action="store_true",
        help="Display the formal fermion equations.",
    )

    args = parser.parse_args()

    print("V4 Unified Field Theory — Fermion Sector")
    print("========================================")

    print("\nOriginal V4 master Lagrangian:")
    print(sp.pretty(V4_ORIGINAL_LAGRANGIAN))

    print("\nOriginal schematic Yukawa term:")
    print(ORIGINAL_YUKAWA_TERM)

    representation_report()

    print("\nProposed gauge-compatible Yukawa interactions")
    print("---------------------------------------------")

    for name, term in YUKAWA_TERMS.items():
        print(f"{name}: {term}")

    print("\nHypercharge-conservation audit")
    print("------------------------------")

    for name, charge in yukawa_hypercharge_checks().items():
        print(
            f"{name:<20} "
            f"total hypercharge = {charge} "
            f"{'PASS' if charge == 0 else 'FAIL'}"
        )

    print("\nEngineering dimensions")
    print("----------------------")

    for name, dimension in yukawa_dimension_checks().items():
        print(f"[{name}] = {dimension}")

    print("\nHiggs-source relation")
    print("---------------------")
    print(HIGGS_SOURCE_RELATION)

    if args.show_equations:
        print("\nFormal fermion equations of motion")
        print("----------------------------------")

        for name, equation in FERMION_EQUATIONS.items():
            print(f"\n{name}:")
            print(equation)

    if args.self_test:
        self_test()


if __name__ == "__main__":
    main()
