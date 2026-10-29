
"""
V4 Unified Field Theory — Coupled Matter and Gauge Currents
Version 0.9

Dependency:
    python -m pip install sympy

Run:
    python v4_coupled_matter.py --self-test
    python v4_coupled_matter.py --derive
    python v4_coupled_matter.py --connect-higgs
    python v4_coupled_matter.py --show-yukawa

Purpose:
    - Preserve the original V4 master equation.
    - Derive fermion gauge-current contributions by differentiation.
    - Expand the Yukawa interaction in Higgs components.
    - Calculate the Yukawa contributions to the four real
      Higgs equations.
    - Optionally connect these contributions to the previous
      v4_electroweak_higgs.py module.

The gauge and matter assignments are a proposed Standard
Model-like realization, not uniquely implied by the original
V4 equation.

This is a symbolic research scaffold, not a complete
or experimentally validated unified theory.
"""

import argparse
from fractions import Fraction

import sympy as sp


# ============================================================
# 1. CANONICAL V4 EQUATION — PRESERVED
# ============================================================

R, F2, G2, W2 = sp.symbols(
    "R F2 G2 W2", real=True
)

K_FERMION, K_HIGGS, V_HIGGS, YUKAWA = sp.symbols(
    "K_fermion K_Higgs V_Higgs Yukawa",
    real=True,
)

V4_ORIGINAL_LAGRANGIAN = (
    R - F2 - G2 - W2
    + K_FERMION + K_HIGGS
    - V_HIGGS - YUKAWA
)


# ============================================================
# 2. SPACETIME AND GAUGE-CONVENTION SETUP
# ============================================================

COORDS = sp.symbols("t x y z", real=True)
DIM = 4

# Match the convention used by v4_electroweak_higgs.py.
ETA = (1, -1, -1, -1)

g, gp = sp.symbols(
    "g g_prime", real=True
)

I = sp.I
SQRT2 = sp.sqrt(2)

# Covariant gauge-potential components.
B = [
    sp.Function(f"B_{mu}")(*COORDS)
    for mu in range(DIM)
]

W = [
    [
        sp.Function(f"W{a}_{mu}")(*COORDS)
        for mu in range(DIM)
    ]
    for a in range(3)
]

# Four real Higgs components:
# H = ((h1 + i*h2), (h3 + i*h4)) / sqrt(2).
h = [
    sp.Function(f"h{i}")(*COORDS)
    for i in range(1, 5)
]

h1, h2, h3, h4 = h

H_plus = (h1 + I*h2) / SQRT2
H_plus_conj = (h1 - I*h2) / SQRT2

H_zero = (h3 + I*h4) / SQRT2
H_zero_conj = (h3 - I*h4) / SQRT2


# ============================================================
# 3. PROPOSED FERMION REPRESENTATIONS
# ============================================================

REP = {
    "Q_L": ("3", "2", Fraction(1, 6)),
    "u_R": ("3", "1", Fraction(2, 3)),
    "d_R": ("3", "1", Fraction(-1, 3)),
    "L_L": ("1", "2", Fraction(-1, 2)),
    "e_R": ("1", "1", Fraction(-1, 1)),
    "H":   ("1", "2", Fraction(1, 2)),
}


def check_yukawa_hypercharges():
    """Check the three renormalizable Yukawa interactions."""

    q = REP["Q_L"][2]
    u = REP["u_R"][2]
    d = REP["d_R"][2]
    ell = REP["L_L"][2]
    e = REP["e_R"][2]
    y_h = REP["H"][2]

    return {
        "down-type": -q + y_h + d,
        "up-type": -q - y_h + u,
        "charged-lepton": -ell + y_h + e,
    }


# ============================================================
# 4. FERMION GAUGE CURRENTS
# ============================================================

# These symbols represent fermion bilinears such as
# bar(f) gamma^mu f, summed over the appropriate suppressed
# color, flavor and weak-isospin indices.
#
# For the SU(2) currents, the generators T^a are already
# inserted into the bilinears.
#
# Convention:
# D_mu = partial_mu - i*g*T^a*W^a_mu - i*g_prime*Y*B_mu
#
# Thus the gauge interaction in bar(psi)i*gamma^mu D_mu psi
# has a positive coefficient in the interaction Lagrangian.
#
# The current source is defined consistently as
# J^mu = - partial(L_matter) / partial(A_mu).
#
# Reversing the convention for D_mu reverses corresponding
# interaction-current signs consistently.

jY = {
    field: [
        sp.Symbol(f"jY_{field}_{mu}", real=True)
        for mu in range(DIM)
    ]
    for field in ("Q_L", "u_R", "d_R", "L_L", "e_R")
}

jWeakQ = [
    [
        sp.Symbol(f"jWeakQ_{a}_{mu}", real=True)
        for mu in range(DIM)
    ]
    for a in range(3)
]

jWeakL = [
    [
        sp.Symbol(f"jWeakL_{a}_{mu}", real=True)
        for mu in range(DIM)
    ]
    for a in range(3)
]


def build_fermion_gauge_interaction():
    """
    Construct the gauge-dependent part of the fermion
    Lagrangian in terms of symbolic current bilinears.
    """

    hypercharge_interaction = 0

    for field in ("Q_L", "u_R", "d_R", "L_L", "e_R"):
        Y = sp.Rational(
            REP[field][2].numerator,
            REP[field][2].denominator,
        )

        hypercharge_interaction += sum(
            gp * B[mu] * Y * jY[field][mu]
            for mu in range(DIM)
        )

    weak_interaction = sum(
        g * W[a][mu] * (
            jWeakQ[a][mu] + jWeakL[a][mu]
        )
        for a in range(3)
        for mu in range(DIM)
    )

    return sp.expand(
        hypercharge_interaction + weak_interaction
    )


L_FERMION_GAUGE = build_fermion_gauge_interaction()


def derive_fermion_gauge_currents():
    """Obtain gauge-current sources by varying the interaction."""

    J_B_fermion = [
        sp.simplify(
            -sp.diff(L_FERMION_GAUGE, B[nu])
        )
        for nu in range(DIM)
    ]

    J_W_fermion = [
        [
            sp.simplify(
                -sp.diff(
                    L_FERMION_GAUGE,
                    W[a][nu],
                )
            )
            for nu in range(DIM)
        ]
        for a in range(3)
    ]

    return J_B_fermion, J_W_fermion


# ============================================================
# 5. YUKAWA INTERACTIONS IN HIGGS COMPONENTS
# ============================================================

# Define symbolic fermion bilinears:
#
# D_u = bar(u_L) Y_d d_R
# D_d = bar(d_L) Y_d d_R
# U_u = bar(u_L) Y_u u_R
# U_d = bar(d_L) Y_u u_R
# E_nu = bar(nu_L) Y_e e_R
# E_e = bar(e_L) Y_e e_R
#
# Their _hc symbols stand for the Hermitian-conjugate
# bilinears. Flavor and color contractions are suppressed.

bilinear_names = (
    "D_u", "D_d", "U_u", "U_d", "E_nu", "E_e",
)

bilinears = {
    name: sp.Symbol(name)
    for name in bilinear_names
}

bilinears_hc = {
    name: sp.Symbol(f"{name}_hc")
    for name in bilinear_names
}

D_u = bilinears["D_u"]
D_d = bilinears["D_d"]
U_u = bilinears["U_u"]
U_d = bilinears["U_d"]
E_nu = bilinears["E_nu"]
E_e = bilinears["E_e"]

D_u_hc = bilinears_hc["D_u"]
D_d_hc = bilinears_hc["D_d"]
U_u_hc = bilinears_hc["U_u"]
U_d_hc = bilinears_hc["U_d"]
E_nu_hc = bilinears_hc["E_nu"]
E_e_hc = bilinears_hc["E_e"]


def build_yukawa_lagrangian():
    """
    Expand the proposed interaction into charged and neutral
    Higgs components, with Hermitian-conjugate terms included.

    L_Y = -Qbar_L Y_d H d_R
          -Qbar_L Y_u H_tilde u_R
          -Lbar_L Y_e H e_R + h.c.

    H_tilde = i*sigma_2*H*
            = (H_zero_conj, -H_plus_conj)^T.
    """

    expression = -(
        H_plus * D_u
        + H_zero * D_d
        + H_zero_conj * U_u
        - H_plus_conj * U_d
        + H_plus * E_nu
        + H_zero * E_e
        + H_plus_conj * D_u_hc
        + H_zero_conj * D_d_hc
        + H_zero * U_u_hc
        - H_plus * U_d_hc
        + H_plus_conj * E_nu_hc
        + H_zero_conj * E_e_hc
    )

    return sp.expand(expression)


L_YUKAWA = build_yukawa_lagrangian()


def derive_yukawa_higgs_sources():
    """
    For a scalar equation convention
        E_i = Box(h_i) + dV/dh_i - d(L_Y)/dh_i = 0,
    the Yukawa contribution is -d(L_Y)/dh_i.
    """

    return [
        sp.simplify(-sp.diff(L_YUKAWA, field))
        for field in h
    ]


YUKAWA_HIGGS_SOURCES = derive_yukawa_higgs_sources()


# ============================================================
# 6. CONNECT TO THE PREVIOUS HIGGS-GAUGE MODULE
# ============================================================

def connect_to_electroweak_higgs():
    """
    Connect the new matter terms to v4_electroweak_higgs.py.

    That module supplies the Higgs-generated currents and the
    gauge-field divergence terms derived from its action.

    The function raises a helpful error if the earlier module
    is not in the same directory.
    """

    try:
        from v4_electroweak_higgs import build_model
    except ImportError as exc:
        raise RuntimeError(
            "Could not import v4_electroweak_higgs.py. "
            "Save the earlier electroweak-Higgs module beside "
            "this script, then retry."
        ) from exc

    model = build_model()

    J_B_fermion, J_W_fermion = (
        derive_fermion_gauge_currents()
    )

    # The Higgs module uses the same named fields B_mu,
    # W_a_mu and h_i. SymPy matches these symbolic functions.

    J_B_total = [
        sp.simplify(
            model["JB"][nu] + J_B_fermion[nu]
        )
        for nu in range(DIM)
    ]

    J_W_total = [
        [
            sp.simplify(
                model["JW"][a][nu]
                + J_W_fermion[a][nu]
            )
            for nu in range(DIM)
        ]
        for a in range(3)
    ]

    # Gauge equations written as residuals equal to zero.
    gauge_residual_B = [
        sp.simplify(
            model["divB"][nu] - J_B_total[nu]
        )
        for nu in range(DIM)
    ]

    gauge_residual_W = [
        [
            sp.simplify(
                model["divW"][a][nu] - J_W_total[a][nu]
            )
            for nu in range(DIM)
        ]
        for a in range(3)
    ]

    # The previous Higgs equations do not include Yukawa terms.
    # Since L_Y contains no derivatives of h_i, its contribution
    # to our E_i = 0 convention is -d(L_Y)/d(h_i).

    higgs_residuals = [
        sp.simplify(
            model["scalar_eoms"][i]
            + YUKAWA_HIGGS_SOURCES[i]
        )
        for i in range(4)
    ]

    return {
        "model": model,
        "J_B_fermion": J_B_fermion,
        "J_W_fermion": J_W_fermion,
        "J_B_total": J_B_total,
        "J_W_total": J_W_total,
        "gauge_residual_B": gauge_residual_B,
        "gauge_residual_W": gauge_residual_W,
        "higgs_residuals": higgs_residuals,
    }


# ============================================================
# 7. SELF-TESTS
# ============================================================

def self_test():
    # Test 1: hypercharge conservation.
    for name, total in check_yukawa_hypercharges().items():
        assert total == 0, (
            f"Hypercharge check failed for {name}: {total}"
        )

    # Test 2: gauge currents obtained from Lagrangian variation.
    J_B, J_W = derive_fermion_gauge_currents()

    for nu in range(DIM):
        expected_B = -gp * sum(
            sp.Rational(
                REP[field][2].numerator,
                REP[field][2].denominator,
            ) * jY[field][nu]
            for field in (
                "Q_L", "u_R", "d_R", "L_L", "e_R"
            )
        )

        assert sp.simplify(
            J_B[nu] - expected_B
        ) == 0

        for a in range(3):
            expected_W = -g * (
                jWeakQ[a][nu] + jWeakL[a][nu]
            )

            assert sp.simplify(
                J_W[a][nu] - expected_W
            ) == 0

    # Test 3: each real Higgs source is the derivative of
    # the explicitly expanded Yukawa Lagrangian.
    for i, field in enumerate(h):
        assert sp.simplify(
            YUKAWA_HIGGS_SOURCES[i]
            + sp.diff(L_YUKAWA, field)
        ) == 0

    # Test 4: Yukawa terms actually contain Higgs dependence.
    assert any(
        sp.diff(L_YUKAWA, field) != 0
        for field in h
    )

    print("V4 coupled-matter self-tests passed.")
    print("Yukawa hypercharges: PASS (3/3)")
    print("U(1) fermion-current variation: PASS (4 components)")
    print("SU(2) fermion-current variation: PASS (12 components)")
    print("Yukawa Higgs-source derivatives: PASS (4 components)")


# ============================================================
# 8. COMMAND-LINE REPORT
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="V4 coupled matter and gauge currents"
    )

    parser.add_argument(
        "--self-test",
        action="store_true",
    )

    parser.add_argument(
        "--derive",
        action="store_true",
    )

    parser.add_argument(
        "--connect-higgs",
        action="store_true",
    )

    parser.add_argument(
        "--show-yukawa",
        action="store_true",
    )

    args = parser.parse_args()

    print("V4 — Coupled Matter and Gauge Currents")
    print("Version 0.9")
    print("=" * 60)

    print("\nOriginal V4 equation preserved.")
    print("Fermion gauge-current convention: J = -d(L_matter)/d(A_mu)")

    print("\nFermion gauge interaction:")
    print("L_f,gauge =")
    print(sp.pretty(L_FERMION_GAUGE))

    J_B_fermion, J_W_fermion = (
        derive_fermion_gauge_currents()
    )

    print("\nDerived fermion-current equations:")
    print("J_Y^nu = -g_prime * sum_f Y_f * bar(f) gamma^nu f")
    print("J_W^(a nu) = -g * [bar(Q_L) gamma^nu T^a Q_L")
    print("                       + bar(L_L) gamma^nu T^a L_L]")

    print("\nYukawa interaction:")
    if args.show_yukawa:
        print(sp.pretty(L_YUKAWA))
    else:
        print(
            "Use --show-yukawa to display the full component "
            "expression including Hermitian-conjugate terms."
        )

    print("\nYukawa contribution to Higgs equations:")

    for i, source in enumerate(
        YUKAWA_HIGGS_SOURCES,
        start=1,
    ):
        print(
            f"  S_h{i}: symbolic derivative generated "
            f"({len(str(source))} characters)"
        )

    if args.derive:
        print("\nCombined gauge equations:")
        print("partial_mu B^(mu nu) = J_Y,H^nu + J_Y,f^nu")
        print("(D_mu W^(mu nu))^a = J_W,H^(a nu) + J_W,f^(a nu)")

        print("\nCombined Higgs equations:")
        print(
            "E_H,i = E_H,i^(gauge+potential) "
            "- d(L_Y)/d(h_i) = 0"
        )

    if args.connect_higgs:
        print("\nConnecting to the electroweak-Higgs module...")
        combined = connect_to_electroweak_higgs()

        print("Connection successful.")
        print("Gauge residuals created:")
        print("  U(1): 4 spacetime components")
        print("  SU(2): 12 gauge/spacetime components")
        print("Higgs residuals created: 4 real components")
        print(
            "Residual expressions are available in "
            "the returned dictionary from "
            "connect_to_electroweak_higgs()."
        )

    if args.self_test:
        self_test()


if __name__ == "__main__":
    main()
