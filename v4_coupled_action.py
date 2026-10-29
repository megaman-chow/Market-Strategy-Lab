
"""
V4 Unified Field Theory — Coupled Action
Version 1.3

Requirements:
    python -m pip install sympy

Requires the existing:
    v4_electroweak_higgs.py
    v4_coupled_matter.py

Run:
    python v4_coupled_action.py --self-test
    python v4_coupled_action.py --derive
    python v4_coupled_action.py --show-components

This assembles the existing flat-spacetime gauge, Higgs,
fermion-current and Yukawa terms into one symbolic action.

The original V4 master equation is preserved as the canonical
starting point. The particular electroweak assignments remain
a proposed comparison-model realization.

Gravity is not yet part of this same arbitrary-spacetime action.
"""

import argparse
import sympy as sp

import v4_electroweak_higgs as ew
import v4_coupled_matter as cm


def euler_lagrange_negative(lagrangian, field, coordinates):
    """
    Return the negative of the conventional Euler-Lagrange
    expression. Setting this result equal to zero gives
    the same equation of motion.
    """
    result = sp.diff(lagrangian, field)

    for coordinate in coordinates:
        result -= sp.diff(
            sp.diff(
                lagrangian,
                sp.diff(field, coordinate)
            ),
            coordinate
        )

    return sp.simplify(-result)


def build_unified_flat_action():
    """
    Assemble one action density for the selected flat-spacetime
    sectors:

        L = L_gauge + L_Higgs + L_fermion,gauge + L_Yukawa

    Fermion bilinears are represented symbolically. Their complete
    spinor dynamics and curved-spacetime coupling remain future work.
    """
    model = ew.build_model()

    L_gauge_higgs = model["Ltotal"]
    L_fermion_gauge = cm.L_FERMION_GAUGE
    L_yukawa = cm.L_YUKAWA

    L_total = (
        L_gauge_higgs
        + L_fermion_gauge
        + L_yukawa
    )

    return {
        "model": model,
        "L_gauge_higgs": L_gauge_higgs,
        "L_fermion_gauge": L_fermion_gauge,
        "L_yukawa": L_yukawa,
        "L_total": L_total,
    }


def derive_combined_equations(system):
    """
    Derive the U(1), SU(2), and four real Higgs equations
    directly from the assembled action.

    Also construct the corresponding source-current residuals
    for comparison with the earlier sector expressions.
    """
    model = system["model"]
    L = system["L_total"]
    coords = cm.COORDS

    # All matter contributions that depend directly on the
    # gauge potentials. The gauge kinetic terms are excluded.
    L_matter = (
        model["LH"]
        + cm.L_FERMION_GAUGE
        + cm.L_YUKAWA
    )

    # Derive gauge currents by varying the matter action.
    J_B = [
        sp.simplify(-sp.diff(L_matter, cm.B[nu]))
        for nu in range(4)
    ]

    J_W = [
        [
            sp.simplify(
                -sp.diff(L_matter, cm.W[a][nu])
            )
            for nu in range(4)
        ]
        for a in range(3)
    ]

    # Derive Euler-Lagrange equations for all gauge components.
    E_B = [
        euler_lagrange_negative(L, cm.B[nu], coords)
        for nu in range(4)
    ]

    E_W = [
        [
            euler_lagrange_negative(
                L,
                cm.W[a][nu],
                coords
            )
            for nu in range(4)
        ]
        for a in range(3)
    ]

    # Derive the four real Higgs-component equations.
    E_H = [
        euler_lagrange_negative(L, field, coords)
        for field in cm.h
    ]

    # Residuals expected to vanish:
    # partial_mu B^(mu nu) - J_B^nu = 0
    # (D_mu W^(mu nu))^a - J_W^(a nu) = 0
    R_B = [
        sp.simplify(
            model["divB"][nu] - J_B[nu]
        )
        for nu in range(4)
    ]

    R_W = [
        [
            sp.simplify(
                model["divW"][a][nu] - J_W[a][nu]
            )
            for nu in range(4)
        ]
        for a in range(3)
    ]

    return {
        "J_B": J_B,
        "J_W": J_W,
        "E_B": E_B,
        "E_W": E_W,
        "E_H": E_H,
        "R_B": R_B,
        "R_W": R_W,
    }


def self_test():
    system = build_unified_flat_action()
    model = system["model"]

    print("V4 coupled-action tests")
    print("=" * 60)

    # Check that the assembled action includes every intended
    # sector by comparing its construction algebraically.
    expected = (
        model["Ltotal"]
        + cm.L_FERMION_GAUGE
        + cm.L_YUKAWA
    )

    assert sp.simplify(
        system["L_total"] - expected
    ) == 0

    print("Action assembly: PASS")

    # Check the Yukawa-source derivatives.
    for i, field in enumerate(cm.h):
        source = cm.YUKAWA_HIGGS_SOURCES[i]

        assert sp.simplify(
            source + sp.diff(cm.L_YUKAWA, field)
        ) == 0

    print("Yukawa source derivatives: PASS")

    # Derive representative gauge equations directly from
    # the combined action, then compare their residuals.
    L = system["L_total"]
    coords = cm.COORDS

    J_B0 = sp.simplify(
        -sp.diff(
            model["LH"] + cm.L_FERMION_GAUGE
            + cm.L_YUKAWA,
            cm.B[0]
        )
    )

    E_B0 = euler_lagrange_negative(
        L, cm.B[0], coords
    )

    assert sp.simplify(
        E_B0 + model["divB"][0] - J_B0
    ) == 0

    print("U(1) combined variation: PASS")

    J_W00 = sp.simplify(
        -sp.diff(
            model["LH"] + cm.L_FERMION_GAUGE
            + cm.L_YUKAWA,
            cm.W[0][0]
        )
    )

    E_W00 = euler_lagrange_negative(
        L, cm.W[0][0], coords
    )

    assert sp.simplify(
        E_W00 + model["divW"][0][0] - J_W00
    ) == 0

    print("SU(2) representative variation: PASS")

    # Check one Higgs equation directly against the original
    # gauge-Higgs equation plus the Yukawa source.
    E_h1 = euler_lagrange_negative(
        L, cm.h[0], coords
    )

    expected_h1 = (
        model["scalar_eoms"][0]
        + cm.YUKAWA_HIGGS_SOURCES[0]
    )

    assert sp.simplify(E_h1 - expected_h1) == 0

    print("Higgs + Yukawa variation: PASS")
    print("\nAll selected coupled-action tests passed.")
    print("Full gravity coupling remains unimplemented.")


def main():
    parser = argparse.ArgumentParser(
        description="V4 coupled action derivation"
    )

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

    args = parser.parse_args()

    system = build_unified_flat_action()

    print("V4 Unified Field Theory")
    print("Coupled Action — Version 1.3")
    print("=" * 60)

    print("\nCanonical V4 master equation preserved.")
    print("\nCombined comparison action density:")
    print(
        "L_total = L_gauge + L_Higgs"
        " + L_fermion,gauge + L_Yukawa"
    )

    print(
        "\nGravity note: this is a unified flat-spacetime "
        "matter/gauge action, not yet the complete V4 action "
        "with arbitrary spacetime curvature."
    )

    if args.self_test:
        self_test()

    if args.derive or args.show_components:
        print("\nDeriving the coupled equations...")
        equations = derive_combined_equations(system)

        print("U(1) equations:", len(equations["E_B"]))
        print("SU(2) equations:", 3 * 4)
        print("Higgs equations:", len(equations["E_H"]))

        print("\nEquation expression sizes:")
        for name in ("E_B", "E_W", "E_H"):
            print(f"{name}:")
            for item in (
                equations[name]
                if name != "E_W"
                else [
                    expr
                    for row in equations[name]
                    for expr in row
                ]
            ):
                print(f"  {len(str(item))} characters")

        if args.show_components:
            for name in ("E_B", "E_W", "E_H"):
                print(f"\n{name}:")

                for item in (
                    equations[name]
                    if name != "E_W"
                    else [
                        expr
                        for row in equations[name]
                        for expr in row
                    ]
                ):
                    print(sp.factor(item))


if __name__ == "__main__":
    main()
