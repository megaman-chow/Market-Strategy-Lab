
"""
V4 Unified Field Theory — Field Definitions, v0.3
==================================================

Install:
    python -m pip install sympy

Run:
    python v4_fields.py
    python v4_fields.py --self-test
    python v4_fields.py --derive-maxwell
    python v4_fields.py --derive-su2

The original equation is preserved symbolically.
Gauge assignments below are explicitly proposed working definitions,
not assumptions hidden inside the original equation.

This is a symbolic research scaffold, not a completed physical theory.
"""

import argparse
import sympy as sp


# ============================================================
# 1. ORIGINAL V4 MASTER EQUATION
# ============================================================

R, F2, G2, W2 = sp.symbols(
    "R F2 G2 W2", real=True
)

K_FERMION, K_HIGGS, V_HIGGS, YUKAWA = sp.symbols(
    "K_fermion K_Higgs V_Higgs Yukawa",
    real=True,
)

# Preserve the precise structure of the equation in the image.
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
# 2. NORMALIZED COMPARISON ACTION
# ============================================================

# This is a comparison baseline, not a replacement for the
# original V4 equation.
#
# Natural units: hbar = c = 1.

M_PL, LAMBDA_COSMO = sp.symbols(
    "M_Pl Lambda", positive=True, real=True
)

B2_SM, W2_SM, G2_SM = sp.symbols(
    "B2_SM W2_SM G2_SM", real=True
)

K_FERMION_SM, K_HIGGS_SM = sp.symbols(
    "K_fermion_SM K_Higgs_SM", real=True
)

V_HIGGS_SM, YUKAWA_SM = sp.symbols(
    "V_Higgs_SM Yukawa_SM", real=True
)

V4_BASELINE_LAGRANGIAN = (
    M_PL**2 * (R - 2 * LAMBDA_COSMO) / 2
    - B2_SM / 4
    - W2_SM / 4
    - G2_SM / 4
    + K_FERMION_SM
    + K_HIGGS_SM
    - V_HIGGS_SM
    - YUKAWA_SM
)


# ============================================================
# 3. SPACETIME AND COORDINATES
# ============================================================

t, x, y, z = sp.symbols(
    "t x y z", real=True
)

COORDS = (t, x, y, z)
DIM = 4

# Flat spacetime with signature (+,-,-,-).
# Curved spacetime requires the general metric and covariant
# derivatives; this metric is used only in the examples here.
ETA = sp.diag(1, -1, -1, -1)


# ============================================================
# 4. ABELIAN FIELD STRENGTH
# ============================================================

def make_abelian_potential(name="A"):
    """Construct A_mu as four symbolic spacetime functions."""
    return [
        sp.Function(f"{name}{mu}")(*COORDS)
        for mu in range(DIM)
    ]


def abelian_field_strength(A, coords=COORDS):
    """
    F_mu_nu = partial_mu A_nu - partial_nu A_mu.

    Indices on the returned matrix are lower indices.
    """
    return [
        [
            sp.diff(A[nu], coords[mu])
            - sp.diff(A[mu], coords[nu])
            for nu in range(DIM)
        ]
        for mu in range(DIM)
    ]


def raise_two_indices(F, metric=ETA):
    """Raise both indices of a rank-two tensor."""
    inverse_metric = metric.inv()

    return [
        [
            sp.simplify(
                sum(
                    inverse_metric[mu, a]
                    * inverse_metric[nu, b]
                    * F[a][b]
                    for a in range(DIM)
                    for b in range(DIM)
                )
            )
            for nu in range(DIM)
        ]
        for mu in range(DIM)
    ]


def abelian_lagrangian(F):
    """L = -1/4 F_mu_nu F^mu_nu."""
    F_up = raise_two_indices(F)

    contraction = sum(
        F[mu][nu] * F_up[mu][nu]
        for mu in range(DIM)
        for nu in range(DIM)
    )

    return -sp.Rational(1, 4) * contraction


def maxwell_equations(F, coords=COORDS):
    """
    Source-free Maxwell equations:
        partial_mu F^mu_nu = 0.

    A current J^nu can be added on the right-hand side.
    """
    F_up = raise_two_indices(F)

    return [
        sp.simplify(
            sum(
                sp.diff(F_up[mu][nu], coords[mu])
                for mu in range(DIM)
            )
        )
        for nu in range(DIM)
    ]


def abelian_bianchi_expression(F, mu, nu, rho, coords=COORDS):
    """
    Bianchi identity:
       partial_mu F_nu_rho
     + partial_nu F_rho_mu
     + partial_rho F_mu_nu = 0.
    """
    return sp.simplify(
        sp.diff(F[nu][rho], coords[mu])
        + sp.diff(F[rho][mu], coords[nu])
        + sp.diff(F[mu][nu], coords[rho])
    )


# ============================================================
# 5. SU(2) NON-ABELIAN FIELD STRENGTH
# ============================================================

def make_su2_potential():
    """W_mu^a: three gauge components, each with four entries."""
    return [
        [
            sp.Function(f"W{a}_{mu}")(*COORDS)
            for mu in range(DIM)
        ]
        for a in range(3)
    ]


def su2_field_strength(W, coupling, coords=COORDS):
    """
    W^a_mu_nu =
        partial_mu W^a_nu
      - partial_nu W^a_mu
      + g * epsilon^abc * W^b_mu * W^c_nu.

    The last term is the non-Abelian interaction.
    """
    F = [
        [
            [sp.S.Zero for _ in range(DIM)]
            for _ in range(DIM)
        ]
        for _ in range(3)
    ]

    for a in range(3):
        for mu in range(DIM):
            for nu in range(DIM):

                derivative_part = (
                    sp.diff(W[a][nu], coords[mu])
                    - sp.diff(W[a][mu], coords[nu])
                )

                interaction_part = sum(
                    sp.LeviCivita(a, b, c)
                    * W[b][mu]
                    * W[c][nu]
                    for b in range(3)
                    for c in range(3)
                )

                F[a][mu][nu] = sp.simplify(
                    derivative_part
                    + coupling * interaction_part
                )

    return F


def su2_field_equations(W, F, coupling, coords=COORDS):
    """
    Source-free SU(2) Yang-Mills equations:

        partial_mu F^{a mu nu}
        + g epsilon^abc W_mu^b F^{c mu nu} = 0.

    This returns 12 symbolic equations:
    3 gauge components x 4 spacetime components.

    Matter currents are omitted here and can be added later.
    """
    equations = []

    for a in range(3):
        F_up = raise_two_indices(F[a])

        for nu in range(DIM):
            derivative_part = sum(
                sp.diff(F_up[mu][nu], coords[mu])
                for mu in range(DIM)
            )

            interaction_part = sum(
                sp.LeviCivita(a, b, c)
                * W[b][mu]
                * raise_two_indices(F[c])[mu][nu]
                for mu in range(DIM)
                for b in range(3)
                for c in range(3)
            )

            equations.append(
                (
                    a,
                    nu,
                    sp.simplify(
                        derivative_part
                        + coupling * interaction_part
                    ),
                )
            )

    return equations


# ============================================================
# 6. FOUR-DIMENSIONAL DIMENSION AUDIT
# ============================================================

# Mass dimensions in natural units:
# [R] = 2, [M_Pl] = 1, [Lambda] = 2.
# A conventional Lagrangian density has dimension 4.

def dimension_audit():
    # Engineering dimensions in four spacetime dimensions,
    # using natural units: hbar = c = 1.
    terms = [
        ("M_Pl^2 * R / 2", 4),
        ("-M_Pl^2 * Lambda", 4),
        ("-F_mu_nu * F^mu_nu / 4", 4),
        ("-G_mu_nu * G^mu_nu / 4", 4),
        ("-W_mu_nu * W^mu_nu / 4", 4),
        ("Fermion kinetic term", 4),
        ("Higgs kinetic term", 4),
        ("Higgs potential", 4),
        ("Yukawa interaction", 4),
    ]

    print("\nLagrangian-term dimension audit")
    print("--------------------------------")

    for name, dimension in terms:
        status = "OK" if dimension == 4 else "ERROR"
        print(f"{name:34} dimension={dimension} {status}")

    print("\nIndividual dimensions:")
    print("[R] = 2")
    print("[M_Pl] = 1")
    print("[Lambda] = 2")
    print("[M_Pl^2 R] = 4")
    print("[M_Pl^2 Lambda] = 4")

    print(
        "\nNote: the first two terms belong to the normalized "
        "comparison action. The original V4 action remains unchanged."
    )


# ============================================================
# 7. SELF-TESTS
# ============================================================

def self_test():
    A = make_abelian_potential()
    F = abelian_field_strength(A)

    # Test antisymmetry.
    for mu in range(DIM):
        for nu in range(DIM):
            assert sp.simplify(
                F[mu][nu] + F[nu][mu]
            ) == 0

    # Test the Abelian Bianchi identity.
    for mu in range(DIM):
        for nu in range(DIM):
            for rho in range(DIM):
                identity = abelian_bianchi_expression(
                    F, mu, nu, rho
                )
                assert identity == 0

    # Test antisymmetry of SU(2) field strengths.
    W = make_su2_potential()
    g = sp.symbols("g", real=True)
    F_su2 = su2_field_strength(W, g)

    for a in range(3):
        for mu in range(DIM):
            for nu in range(DIM):
                assert sp.simplify(
                    F_su2[a][mu][nu]
                    + F_su2[a][nu][mu]
                ) == 0

    print("V4 field-definition self-tests passed.")


# ============================================================
# 8. COMMAND LINE
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="V4 Unified Field Theory research scaffold"
    )

    parser.add_argument(
        "--self-test",
        action="store_true"
    )

    parser.add_argument(
        "--derive-maxwell",
        action="store_true"
    )

    parser.add_argument(
        "--derive-su2",
        action="store_true"
    )

    args = parser.parse_args()

    print("V4 Unified Field Theory — Field Definitions")
    print("--------------------------------------------")
    print("\nOriginal V4 Lagrangian density:")
    print(sp.pretty(V4_ORIGINAL_LAGRANGIAN))

    print("\nNormalized comparison density:")
    print(sp.pretty(V4_BASELINE_LAGRANGIAN))

    dimension_audit()

    if args.self_test:
        self_test()

    if args.derive_maxwell:
        A = make_abelian_potential()
        F = abelian_field_strength(A)
        equations = maxwell_equations(F)

        print("\nSource-free Maxwell equations")
        for nu, equation in enumerate(equations):
            print(f"nu={nu}: {equation} = 0")

    if args.derive_su2:
        W = make_su2_potential()
        g = sp.symbols("g", real=True)
        F = su2_field_strength(W, g)
        equations = su2_field_equations(W, F, g)

        print("\nSU(2) field equations")
        print("---------------------")

        for a, nu, equation in equations:
            print(
                f"Gauge component a={a}, spacetime component nu={nu}: "
                f"D_mu F^(a mu {nu}) = 0"
            )

        print(
            f"\nGenerated {len(equations)} component expressions. "
            "Use the symbolic expressions in the equations list "
            "for further calculations."
        )


if __name__ == "__main__":
    main()
