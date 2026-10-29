
"""
V4 Unified Field Theory — Electroweak Gauge-Higgs Sector
Version 0.8

Install:
    python -m pip install sympy

Run:
    python v4_electroweak_higgs.py --self-test
    python v4_electroweak_higgs.py --derive
    python v4_electroweak_higgs.py --show-components
    python v4_electroweak_higgs.py --show-currents

This is a comparison-model sector for developing V4.
It does not identify F, G and W in the original equation
with particular gauge groups.
"""

import argparse
import sympy as sp

COORDS = sp.symbols("t x y z", real=True)
ETA = (1, -1, -1, -1)
DIM = 4

g, gp, mu2, lam = sp.symbols(
    "g g_prime mu_H2 lambda_H", real=True
)
YH = sp.Rational(1, 2)

# Four real components of one complex Higgs doublet:
# H = ((h1 + i*h2), (h3 + i*h4)) / sqrt(2)
h = [sp.Function(f"h{i}")(*COORDS) for i in range(1, 5)]

# Covariant gauge-potential components.
B = [
    sp.Function(f"B_{mu}")(*COORDS)
    for mu in range(DIM)
]

# W[a][mu] represents W^a_mu, with a=0,1,2
# corresponding to conventional gauge labels 1,2,3.
W = [
    [
        sp.Function(f"W{a}_{mu}")(*COORDS)
        for mu in range(DIM)
    ]
    for a in range(3)
]

rho = sum(hi**2 for hi in h) / 2
V = -mu2 * rho + lam * rho**2


def raise2(F):
    """Raise both spacetime indices using (+---)."""
    return [
        [
            sp.simplify(ETA[mu] * ETA[nu] * F[mu][nu])
            for nu in range(DIM)
        ]
        for mu in range(DIM)
    ]


def build_model():
    # ========================================================
    # 1. U(1) HYPERCHARGE FIELD STRENGTH
    # ========================================================

    FB = [
        [
            sp.diff(B[nu], COORDS[mu])
            - sp.diff(B[mu], COORDS[nu])
            for nu in range(DIM)
        ]
        for mu in range(DIM)
    ]

    FBup = raise2(FB)

    LB = -sp.Rational(1, 4) * sum(
        FB[mu][nu] * FBup[mu][nu]
        for mu in range(DIM)
        for nu in range(DIM)
    )

    # ========================================================
    # 2. NON-ABELIAN SU(2) FIELD STRENGTHS
    # ========================================================

    FW = [
        [
            [sp.S.Zero for _ in range(DIM)]
            for _ in range(DIM)
        ]
        for _ in range(3)
    ]

    for a in range(3):
        for mu in range(DIM):
            for nu in range(DIM):
                FW[a][mu][nu] = (
                    sp.diff(W[a][nu], COORDS[mu])
                    - sp.diff(W[a][mu], COORDS[nu])
                    + g * sum(
                        sp.LeviCivita(a, b, c)
                        * W[b][mu]
                        * W[c][nu]
                        for b in range(3)
                        for c in range(3)
                    )
                )

    FWup = [raise2(FW[a]) for a in range(3)]

    LW = -sp.Rational(1, 4) * sum(
        FW[a][mu][nu] * FWup[a][mu][nu]
        for a in range(3)
        for mu in range(DIM)
        for nu in range(DIM)
    )

    # ========================================================
    # 3. GAUGE-COVARIANT HIGGS DERIVATIVE
    # ========================================================
    #
    # D_mu H = [
    #   partial_mu - i*g*W_mu^a*sigma^a/2
    #              - i*g'*Y_H*B_mu
    # ] H
    #
    # Written using the four real scalar components.

    dR, dI = [], []

    for mu in range(DIM):
        a = gp * YH * B[mu] + g * W[2][mu] / 2
        d = gp * YH * B[mu] - g * W[2][mu] / 2
        b = g * W[0][mu] / 2
        c = g * W[1][mu] / 2

        dR.append((
            sp.diff(h[0], COORDS[mu])
            + a * h[1] + b * h[3] - c * h[2],

            sp.diff(h[2], COORDS[mu])
            + b * h[1] + c * h[0] + d * h[3],
        ))

        dI.append((
            sp.diff(h[1], COORDS[mu])
            - a * h[0] - b * h[2] - c * h[3],

            sp.diff(h[3], COORDS[mu])
            - b * h[0] + c * h[1] - d * h[2],
        ))

    LHkin = sp.Rational(1, 2) * sum(
        ETA[mu] * sum(
            component**2
            for pair in (dR[mu], dI[mu])
            for component in pair
        )
        for mu in range(DIM)
    )

    LH = LHkin - V

    # Comparison action for this sector.
    Ltotal = LB + LW + LH

    # ========================================================
    # 4. HIGGS CURRENTS FROM VARIATION
    # ========================================================
    #
    # J^nu = -d(L_Higgs)/d(A_nu)
    #
    # Gauge-potential components here have lower spacetime
    # indices. Metric factors are already in the Lagrangian.

    JB = [
        sp.simplify(-sp.diff(LH, B[nu]))
        for nu in range(DIM)
    ]

    JW = [
        [
            sp.simplify(-sp.diff(LH, W[a][nu]))
            for nu in range(DIM)
        ]
        for a in range(3)
    ]

    # ========================================================
    # 5. GAUGE FIELD EQUATIONS
    # ========================================================

    divB = [
        sp.simplify(
            sum(
                sp.diff(FBup[mu][nu], COORDS[mu])
                for mu in range(DIM)
            )
        )
        for nu in range(DIM)
    ]

    # (D_mu W^(mu nu))^a
    divW = [
        [
            sp.simplify(
                sum(
                    sp.diff(
                        FWup[a][mu][nu],
                        COORDS[mu]
                    )
                    for mu in range(DIM)
                )
                + g * sum(
                    sp.LeviCivita(a, b, c)
                    * W[b][mu]
                    * FWup[c][mu][nu]
                    for mu in range(DIM)
                    for b in range(3)
                    for c in range(3)
                )
            )
            for nu in range(DIM)
        ]
        for a in range(3)
    ]

    # The gauge equations are:
    # divB[nu] - JB[nu] = 0
    # divW[a][nu] - JW[a][nu] = 0

    # ========================================================
    # 6. HIGGS EQUATIONS FROM EULER-LAGRANGE VARIATION
    # ========================================================

    def eom(field):
        # Negative of the conventional Euler-Lagrange
        # expression; the field equation is still E = 0.
        expr = sp.diff(Ltotal, field)

        for coordinate in COORDS:
            expr -= sp.diff(
                sp.diff(
                    Ltotal,
                    sp.diff(field, coordinate)
                ),
                coordinate
            )

        return sp.simplify(-expr)

    scalar_eoms = [eom(hi) for hi in h]

    return {
        "FB": FB,
        "FW": FW,
        "rho": rho,
        "V": V,
        "Ltotal": Ltotal,
        "LH": LH,
        "JB": JB,
        "JW": JW,
        "divB": divB,
        "divW": divW,
        "scalar_eoms": scalar_eoms,
    }


def self_test(model):
    # Test 1: Abelian tensor antisymmetry.
    for mu in range(DIM):
        for nu in range(DIM):
            assert sp.simplify(
                model["FB"][mu][nu]
                + model["FB"][nu][mu]
            ) == 0

            # Test 2: non-Abelian tensor antisymmetry.
            for a in range(3):
                assert sp.simplify(
                    model["FW"][a][mu][nu]
                    + model["FW"][a][nu][mu]
                ) == 0

    # Test 3: gauge currents vanish when both gauge couplings
    # are set to zero.
    for nu in range(DIM):
        assert sp.simplify(
            model["JB"][nu].subs({g: 0, gp: 0})
        ) == 0

        for a in range(3):
            assert sp.simplify(
                model["JW"][a][nu].subs({g: 0, gp: 0})
            ) == 0

    # Test 4: the scalar equations reduce to the ordinary
    # scalar equations when gauge couplings vanish.
    for i, hi in enumerate(h):
        equation = sp.simplify(
            model["scalar_eoms"][i].subs({
                g: 0,
                gp: 0,
            })
        )

        box_h = sum(
            ETA[mu] * sp.diff(
                hi, COORDS[mu], 2
            )
            for mu in range(DIM)
        )

        expected = sp.simplify(
            box_h + sp.diff(V, hi)
        )

        assert sp.simplify(
            equation - expected
        ) == 0

    print("V4 electroweak-Higgs self-tests passed.")
    print("U(1) field-strength antisymmetry: PASS")
    print("SU(2) field-strength antisymmetry: PASS")
    print("Zero-coupling gauge currents: PASS")
    print("Decoupled scalar-field limit: PASS (4 components)")


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--self-test",
        action="store_true"
    )

    parser.add_argument(
        "--derive",
        action="store_true"
    )

    parser.add_argument(
        "--show-components",
        action="store_true"
    )

    parser.add_argument(
        "--show-currents",
        action="store_true"
    )

    args = parser.parse_args()

    print("V4 Electroweak Gauge-Higgs Sector — Version 0.8")
    print("Model: SU(2)_L x U(1)_Y with one Higgs doublet")
    print("Metric signature: (+---)")
    print("H = ((h1+i*h2), (h3+i*h4)) / sqrt(2)")
    print("V(H) = -mu_H2(H†H) + lambda_H(H†H)^2")

    model = build_model()

    print("\nCompact gauge field equations:")
    print("partial_mu B^(mu nu) = J_Y^nu")
    print("(D_mu W^(mu nu))^a = J_W^(a nu)")
    print(
        "Currents are obtained by varying the Higgs "
        "kinetic term with respect to the gauge fields."
    )

    print("\nDerived equations:")
    print("  4 real-component Higgs equations")
    print("  4 U(1) gauge equations")
    print("  12 SU(2) gauge equations")

    if args.show_currents:
        print("\nU(1) Higgs currents:")

        for nu, current in enumerate(model["JB"]):
            print(f"J_Y^{nu} = {sp.factor(current)}")

        print("\nSU(2) Higgs currents:")

        for a in range(3):
            for nu in range(DIM):
                print(
                    f"J_W^{a},{nu} = "
                    f"{sp.factor(model['JW'][a][nu])}"
                )

    if args.derive or args.show_components:
        print("\nHiggs equations:")

        for i, equation in enumerate(
            model["scalar_eoms"], start=1
        ):
            print(
                f"h{i}: derived "
                f"({len(str(equation))} characters)"
            )

            if args.show_components:
                print(sp.factor(equation))

    if args.self_test:
        self_test(model)


if __name__ == "__main__":
    main()
