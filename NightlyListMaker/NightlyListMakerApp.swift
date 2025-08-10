//
//  NightlyListMakerApp.swift
//  NightlyListMaker
//
//  Created by Tejas Patel on 8/9/25.
//

import SwiftUI
import CoreData

@main
struct NightlyListMakerApp: App {
    let persistenceController = PersistenceController.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, persistenceController.container.viewContext)
        }
    }
}
