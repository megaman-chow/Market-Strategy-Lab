
"""
V4 Unified Field Theory — Unified Action Assembly
Version 0.6

Install:
    python -m pip install sympy

Run:
    python v4_unified_action.py
    python v4_unified_action.py --self-test
    python v4_unified_action.py --show-equations

Purpose:
    1. Preserve the original V4 master equation.
    2. Construct a normalized comparison action.
    3. Audit engineering dimensions.
    4. Verify proposed Yukawa hypercharges.
    5. Check the Higgs-potential stationary point.
    6. Display compact target equations for the unified sectors.

Important:
    The comparison action uses an explicit Standard Model-like
    realization. It does not redefine the user's original V4 equation.

    The full coupled tensor and spinor equations are not yet
    automatically derived by this module.
"""

import argparse
from fractions import Fraction

import sympy as sp


# ============================================================
# 1. CANONICAL V4 MASTER EQUATION
# ============================================================

R, F2, G2, W2 = sp.symbols(
    "R F2 G2 W2",
    real=True,
)

K_FERMION, K_HIGGS, V_HIGGS, YUKAWA = sp.symbols(
    "K_fermion K_Higgs V_Higgs Yukawa",
    real=True,
)

# Exact term structure of the equation in the image.
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
# 2. NORMALIZED COMPARISON ACTION
# ============================================================

M_PL, LAMBDA_COSMO = sp.symbols(
    "M_Pl Lambda",
    positive=True,
    real=True,
)

# Independent comparison fields:
# B_mu:       U(1)_Y gauge field
# W_mu^a:     SU(2)_L gauge fields
# G_mu^A:     SU(3)_C gauge fields
#
# These are NOT automatically identified with the original
# F, G, W symbols.

B2_SM, W2_SM, G2_SM = sp.symbols(
    "B2_SM W2_SM G2_SM",
    real=True,
)

K_FERMION_SM, K_HIGGS_SM = sp.symbols(
    "K_fermion_SM K_Higgs_SM",
    real=True,
)

V_HIGGS_SM, L_YUKAWA_SM = sp.symbols(
    "V_Higgs_SM L_Yukawa_SM",
    real=True,
)

V4_COMPARISON_LAGRANGIAN = (
    M_PL**2
    * (R - 2 * LAMBDA_COSMO)
    / 2
    - B2_SM / 4
    - W2_SM / 4
    - G2_SM / 4
    + K_FERMION_SM
    + K_HIGGS_SM
    - V_HIGGS_SM
    - L_YUKAWA_SM
)


# ============================================================
# 3. ENGINEERING-DIMENSION AUDIT
# ============================================================

# Natural units: hbar = c = 1.
# A four-dimensional Lagrangian density must have mass dimension 4.

DIMENSIONS = {
    R: sp.Rational(2),

    F2: sp.Rational(4),
    G2: sp.Rational(4),
    W2: sp.Rational(4),

    K_FERMION: sp.Rational(4),
    K_HIGGS: sp.Rational(4),
    V_HIGGS: sp.Rational(4),
    YUKAWA: sp.Rational(4),

    M_PL: sp.Rational(1),
    LAMBDA_COSMO: sp.Rational(2),

    B2_SM: sp.Rational(4),
    W2_SM: sp.Rational(4),
    G2_SM: sp.Rational(4),

    K_FERMION_SM: sp.Rational(4),
    K_HIGGS_SM: sp.Rational(4),
    V_HIGGS_SM: sp.Rational(4),
    L_YUKAWA_SM: sp.Rational(4),
}


def mass_dimension(expr):
    """
    Return an engineering mass dimension.

    Return None when the expression combines terms of
    different dimensions or contains an unknown symbol.
    """
    expr = sp.sympify(expr)

    if expr.is_Number:
        return sp.Rational(0)

    if expr.is_Symbol:
        return DIMENSIONS.get(expr)

    if expr.is_Add:
        dimensions = [
            mass_dimension(term)
            for term in expr.args
        ]

        if any(d is None for d in dimensions):
            return None

        if len(set(dimensions)) != 1:
            return None

        return dimensions[0]

    if expr.is_Mul:
        dimensions = [
            mass_dimension(factor)
            for factor in expr.args
        ]

        if any(d is None for d in dimensions):
            return None

        return sum(dimensions, sp.Rational(0))

    if expr.is_Pow and expr.exp.is_number:
        base_dimension = mass_dimension(expr.base)

        if base_dimension is None:
            return None

        return base_dimension * expr.exp

    return None


def dimension_report():
    print("\nDIMENSION AUDIT")
    print("=" * 60)

    original_dimension = mass_dimension(
        V4_ORIGINAL_LAGRANGIAN
    )

    print(
        "Original V4 density:",
        (
            "mixed/unspecified dimensions"
            if original_dimension is None
            else original_dimension
        ),
    )

    comparison_dimension = mass_dimension(
        V4_COMPARISON_LAGRANGIAN
    )

    print(
        "Normalized comparison density:",
        (
            "UNKNOWN"
            if comparison_dimension is None
            else comparison_dimension
        ),
    )

    assert comparison_dimension == 4

    print("\nTerm checks:")

    terms = [
        ("M_Pl^2 * R", M_PL**2 * R),
        ("M_Pl^2 * Lambda", M_PL**2 * LAMBDA_COSMO),
        ("U(1) gauge kinetic term", B2_SM),
        ("SU(2) gauge kinetic term", W2_SM),
        ("SU(3) gauge kinetic term", G2_SM),
        ("Fermion kinetic term", K_FERMION_SM),
        ("Higgs kinetic term", K_HIGGS_SM),
        ("Higgs potential", V_HIGGS_SM),
        ("Yukawa interaction", L_YUKAWA_SM),
    ]

    for name, term in terms:
        dim = mass_dimension(term)

        if name == "M_Pl^2 * R":
            dim = mass_dimension(M_PL**2 * R)

        elif name == "M_Pl^2 * Lambda":
            dim = mass_dimension(
                M_PL**2 * LAMBDA_COSMO
            )

        print(
            f"  {name:<30} "
            f"dimension={dim}"
        )

    print("\nComparison action: all terms have dimension four.")


# ============================================================
# 4. PROPOSED YUKAWA HYPERCHARGE AUDIT
# ============================================================

# Proposed representation assignments.
#
# These are assumptions of the comparison model, not definitions
# contained in the original V4 image.

REPRESENTATIONS = {
    "Q_L": ("3", "2", Fraction(1, 6)),
    "u_R": ("3", "1", Fraction(2, 3)),
    "d_R": ("3", "1", Fraction(-1, 3)),
    "L_L": ("1", "2", Fraction(-1, 2)),
    "e_R": ("1", "1", Fraction(-1, 1)),
    "H": ("1", "2", Fraction(1, 2)),
}


def hypercharge_checks():
    q = REPRESENTATIONS["Q_L"][2]
    u = REPRESENTATIONS["u_R"][2]
    d = REPRESENTATIONS["d_R"][2]
    ell = REPRESENTATIONS["L_L"][2]
    e = REPRESENTATIONS["e_R"][2]
    h = REPRESENTATIONS["H"][2]

    return {
        # Qbar_L H d_R
        "Down-type Yukawa": -q + h + d,

        # Qbar_L H_tilde u_R
        "Up-type Yukawa": -q - h + u,

        # Lbar_L H e_R
        "Charged-lepton Yukawa": -ell + h + e,
    }


def report_hypercharges():
    print("\nYUKAWA HYPERCHARGE AUDIT")
    print("=" * 60)

    results = hypercharge_checks()

    for name, charge in results.items():
        status = "PASS" if charge == 0 else "FAIL"

        print(
            f"{name:<26} "
            f"Y_total={charge!s:<8} {status}"
        )

    return results


# ============================================================
# 5. HIGGS POTENTIAL
# ============================================================

# Proposed doublet potential:
#
# V(H) = -mu_H2 * (H^dagger H)
#        + lambda_H * (H^dagger H)^2
#
# mu_H2 > 0 and lambda_H > 0.
#
# Define rho = H^dagger H, a non-negative scalar.

rho = sp.symbols("rho", nonnegative=True, real=True)

mu_H2, lambda_H = sp.symbols(
    "mu_H2 lambda_H",
    positive=True,
    real=True,
)

HIGGS_POTENTIAL = (
    -mu_H2 * rho
    + lambda_H * rho**2
)

HIGGS_STATIONARY_POINT = sp.solve(
    sp.diff(HIGGS_POTENTIAL, rho),
    rho,
)


def report_higgs_potential():
    print("\nHIGGS POTENTIAL")
    print("=" * 60)

    print("V(rho) =")
    print(sp.pretty(HIGGS_POTENTIAL))

    print("\ndV/drho =")
    print(sp.pretty(sp.diff(HIGGS_POTENTIAL, rho)))

    print("\nStationary values of rho:")
    print(HIGGS_STATIONARY_POINT)

    rho_min = mu_H2 / (2 * lambda_H)

    assert sp.simplify(
        sp.diff(HIGGS_POTENTIAL, rho).subs(
            rho, rho_min
        )
    ) == 0

    print("\nFor the nonzero minimum:")
    print("H^dagger H = mu_H2 / (2 lambda_H)")
    print("With H^dagger H = v^2/2: v^2 = mu_H2/lambda_H")


# ============================================================
# 6. COMPACT COUPLED FIELD-EQUATION TARGETS
# ============================================================

# These are the expected compact equations for the comparison
# model under consistent conventions. They are not all generated
# by symbolic variation in this script.

FIELD_EQUATIONS = {
    "Gravity": (
        "M_Pl^2 (G_mu_nu + Lambda g_mu_nu) = T_mu_nu"
    ),

    "U(1)_Y gauge field": (
        "nabla_mu B^(mu nu) = J_Y^nu"
    ),

    "SU(2)_L gauge field": (
        "(D_mu W^(mu nu))^a = J_W^(a nu)"
    ),

    "SU(3)_C gauge field": (
        "(D_mu G^(mu nu))^A = J_G^(A nu)"
    ),

    "Higgs doublet": (
        "D_mu D^mu H + dV/dH^dagger "
        "+ dL_Y/dH^dagger = 0"
    ),

    "Left-handed quark doublet": (
        "i gamma^mu D_mu Q_L "
        "- Y_d H d_R - Y_u H_tilde u_R = 0"
    ),

    "Right-handed up quarks": (
        "i gamma^mu D_mu u_R "
        "- Y_u^dagger H_tilde^dagger Q_L = 0"
    ),

    "Right-handed down quarks": (
        "i gamma^mu D_mu d_R "
        "- Y_d^dagger H^dagger Q_L = 0"
    ),

    "Left-handed lepton doublet": (
        "i gamma^mu D_mu L_L - Y_e H e_R = 0"
    ),

    "Right-handed charged leptons": (
        "i gamma^mu D_mu e_R "
        "- Y_e^dagger H^dagger L_L = 0"
    ),
}


def report_field_equations():
    print("\nCOMPACT FIELD-EQUATION TARGETS")
    print("=" * 60)

    for sector, equation in FIELD_EQUATIONS.items():
        print(f"\n{sector}:")
        print(f"  {equation}")

    print(
        "\nThe current definitions and index contractions must "
        "be fixed before these equations can be treated as "
        "the fully derived equations of V4."
    )


# ============================================================
# 7. SELF-TESTS
# ============================================================

def self_test():
    assert mass_dimension(
        V4_COMPARISON_LAGRANGIAN
    ) == 4

    # The original equation has an unnormalized R term.
    assert mass_dimension(
        V4_ORIGINAL_LAGRANGIAN
    ) is None

    # Verify gauge-invariant Yukawa hypercharges.
    for name, charge in hypercharge_checks().items():
        assert charge == 0, (
            f"Hypercharge test failed: {name} = {charge}"
        )

    # Verify the nonzero Higgs stationary point.
    rho_min = mu_H2 / (2 * lambda_H)

    assert sp.simplify(
        sp.diff(HIGGS_POTENTIAL, rho).subs(
            rho, rho_min
        )
    ) == 0

    # The second derivative is positive at the minimum.
    assert sp.diff(
        HIGGS_POTENTIAL, rho, 2
    ) == 2 * lambda_H

    assert len(FIELD_EQUATIONS) == 10

    print("\nV4 unified-action self-tests passed.")
    print("Normalized action dimensions: PASS")
    print("Original-action dimensional warning: PASS")
    print("Yukawa hypercharges: PASS (3/3)")
    print("Higgs stationary point: PASS")
    print("Field-equation registry: PASS")


# ============================================================
# 8. COMMAND LINE
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="V4 Unified Action Assembly"
    )

    parser.add_argument(
        "--self-test",
        action="store_true",
    )

    parser.add_argument(
        "--show-equations",
        action="store_true",
    )

    parser.add_argument(
        "--show-action",
        action="store_true",
    )

    args = parser.parse_args()

    print("V4 UNIFIED FIELD THEORY")
    print("Unified Action Assembly — Version 0.6")
    print("=" * 60)

    print(
        "\nOriginal V4 equation preserved as the canonical "
        "starting expression."
    )

    if args.show_action:
        print("\nOriginal V4 Lagrangian density:")
        print(sp.pretty(V4_ORIGINAL_LAGRANGIAN))

        print("\nNormalized comparison Lagrangian density:")
        print(sp.pretty(V4_COMPARISON_LAGRANGIAN))

    dimension_report()
    report_hypercharges()
    report_higgs_potential()

    if args.show_equations:
        report_field_equations()

    if args.self_test:
        self_test()


if __name__ == "__main__":
    main()
