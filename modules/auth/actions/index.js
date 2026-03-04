"use server";
import { db } from "@/lib/db";
import { currentUser } from "@clerk/nextjs/dist/types/server";

export const onBoardUser = async () => {
  try {
    const user = await currentUser();

    if (!user) {
      return { success: false, error: "No authenticated user found" };
    }
    const { id, firstName, lastName, emailAddresses, imageUrl } = user;

    const newUser = await db.usert.upsert({
        where:{
            clerkId: id
        },
        update:{
            firstName: firstName || null,
            lastName: lastName || null,
            imageUrl: imageUrl || null,
            email: emailAddresses[0]?.emailAddress || "",
        },
        create:{
            clerkId: id,
            firstName: firstName || null,
            lastName: lastName || null,
            imageUrl: imageUrl || null,
            email: emailAddresses[0]?.emailAddress || "",
        },
    })

    return {
        success: true,
        user: newUser,
        message: "User obBoarded successfully"
    }
  } catch (error) {
    console.error("Error onBoarding user:", error);
    return {
        success: false,
        error: "Failed to onboard user"
    }
  }
};
